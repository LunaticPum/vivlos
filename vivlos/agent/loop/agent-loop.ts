import {
	agentLoop,
	agentLoopContinue,
	type AgentContext,
	type AgentLoopConfig,
	type AgentMessage,
	type AgentTool,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Model, Api, AssistantMessage, Message } from "@earendil-works/pi-ai";
import { randomUUID } from "node:crypto";

import type { SessionManager } from "@vivlos/agent/session/index.ts";
import type { MemoryRuntime } from "@vivlos/agent/memory/index.ts";
import type { PromptBuilder } from "@vivlos/agent/prompt/types.ts";
import type { LoopHooks } from "@vivlos/agent/loop/hooks/index.ts";
import {
	compact,
	type CompactorDeps,
	type CompactionState,
	type CompactionResult,
} from "../compression/index.ts";
import type { CompressionConfig } from "@vivlos/infra/config/index.ts";
import { loadConfig } from "@vivlos/infra/config/index.ts";
import { appendCompaction } from "@vivlos/infra/storage/session/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/types.ts";

import type { LoopConfig, LoopResult, AgentLoopDeps } from "./types.ts";
import { mapAgentEvent } from "./event-mapper.ts";
import {
	getRetryDelayMs,
	isRetryableAgentError,
	waitForRetry,
} from "./retry.ts";

/**
 * agentLoop 创建参数--组合根注入的依赖集合。
 */
export interface CreateAgentLoopParams {
	/** LLM + EventBus 基础依赖 */
	readonly deps: AgentLoopDeps;

	/** 当前 session 的 Memory 运行时 */
	readonly memoryRuntime: MemoryRuntime;
	/** SessionManager -- 消息存储管理 */
	readonly sessionManager: SessionManager;
	/** PromptBuilder -- system prompt 组装（session 级冻结快照） */
	readonly promptBuilder: PromptBuilder;
	/** 可选 loop 控制 hook（maxTurns / steering / followUp） */
	readonly hooks?: LoopHooks;
	/** 工具列表 -- 传入 AgentContext.tools，由 pi agentLoop 调度 tool calling */
	readonly tools?: AgentTool<any, any>[];
}

/**
 * 创建 agent 主循环。
 *
 * 封装 pi 的 agentLoop()，编排一次完整的 LLM 对话：
 *   1. 构造 prompt 消息
 *   1.5 压缩检查（超阈值时压缩消息历史 + 更新 SP）
 *   2. Lazy freeze（SP 未冻结时读 memory + 冻结）
 *   3. 组装 AgentContext（SP 复用冻结快照）
 *   4. 桥接 streamFn（LLMClient -> pi StreamFn）
 *   5. 组装 loop config
 *   6. 启动 pi agentLoop；瞬时错误经退避后由 agentLoopContinue 续跑
 *   7. 将低层 attempt 事件映射为同一个顶层 Conversation 生命周期
 *   8. 从失败 attempt 中剔除 terminal assistant，保留有效 Tool 上下文
 *   9. 最终成功或存在有效进展时，提交 canonical 消息到 session
 */
export function createAgentLoop(params: CreateAgentLoopParams) {
	const { deps, sessionManager, promptBuilder } = params;
	// 压缩防抖状态（跨 turn 维护，session 级别）
	const compactionState: CompactionState = {
		consecutiveNoOp: 0,
		autoPaused: false,
		lastSummary: null,
	};
	// 压缩配置（启动时加载一次）
	const runtimeConfig = loadConfig();
	const compressionConfig = runtimeConfig.compression;
	const retryConfig = runtimeConfig.retry;

	return {
		async run(
			userInput: string | AgentMessage[],
			config: LoopConfig,
		): Promise<LoopResult> {
			// #region 请求准备

			// --- 1. 构造 user message(s) ---
			const rawPrompts: AgentMessage[] =
				typeof userInput === "string"
					? [
							{
								role: "user",
								content: [{ type: "text", text: userInput }],
								timestamp: Date.now(),
							},
						]
					: userInput;
			const prompts = rawPrompts.map(ensureMessageId);
			const transientPrompts = (config.transientMessages ?? []).map(ensureMessageId);
			const transientIds = new Set(transientPrompts.map((message) => message.id));
			const requestPrompts = [...transientPrompts, ...prompts];

			// --- 1.5 压缩检查（在构建 context 前检查是否需要压缩） ---
			if (config.model.contextWindow > 0) {
				const compactorDeps: CompactorDeps = {
					llm: deps.llm,
					model: resolveCompressionModel(
						deps.llm,
						compressionConfig,
						config.model,
					),
					config: compressionConfig,
				};
				const result = await compact({
					messages: [...sessionManager.getMessages()],
					contextWindow: config.model.contextWindow,
					deps: compactorDeps,
					state: compactionState,
					signal: config.signal,
				});
				if (!result.noOp) {
					sessionManager.replaceMessages(result.messages);
					promptBuilder.setCompactedHistory(result.summary);
					promptBuilder.invalidate();
					// 写 compaction entry 到 JSONL（审计用）
					appendCompaction(sessionManager.filePath, {
						type: "compaction",
						summary: result.summary,
						compactedCount: result.compactedCount,
						timestamp: Date.now(),
					});
				}
			}

			// #endregion
			// #region 运行时上下文

			// --- 2. Lazy freeze: SP 未冻结时读 memory + 冻结（session 启动/切换/压缩后首次） ---
			await params.memoryRuntime.prepare(config.model, config.signal);
			if (!promptBuilder.isFrozen()) {
				const memoryBlock = params.memoryRuntime.buildPrompt();
				// 空字符串也必须写入，避免 invalidate 后沿用旧 Memory。
				promptBuilder.setMemory(memoryBlock);
				promptBuilder.freeze();
			}

			// --- 3. 构造 AgentContext（SP 复用 session 级冻结快照） ---
			const context: AgentContext = {
				systemPrompt: promptBuilder.getCached(),
				messages: [...sessionManager.getMessages()],
				tools: params.tools ?? [],
			};

			// --- 4. 构造 streamFn -- 桥接 LLMClient -> pi StreamFn ---
			const streamFn: StreamFn = (model, context, options) => {
				return deps.llm.stream(model, context, {
					signal: options?.signal,
					reasoning: options?.reasoning,
				});
			};

			// --- 5. 组装 loop config ---
			let preparedContext: AgentContext | undefined;
			let preparedLoopConfig: AgentLoopConfig | undefined;
			let activeLoopConfig: AgentLoopConfig;
			const loopConfig: AgentLoopConfig = {
				model: config.model,
				reasoning: config.reasoning,
				// 过滤 AgentMessage -> 标准 Message（只保留 user/assistant/toolResult）
				convertToLlm: (messages: AgentMessage[]): Message[] => {
					return messages.filter(
						(m): m is Message =>
							m.role === "user" ||
							m.role === "assistant" ||
							m.role === "toolResult",
					);
				},
				...params.hooks,
				prepareNextTurn: async (turnContext) => {
					const external = await params.hooks?.prepareNextTurn?.(turnContext);
					const currentLoopConfig = preparedLoopConfig ?? activeLoopConfig;
					const nextModel = external?.model ?? currentLoopConfig.model;
					await params.memoryRuntime.prepare(nextModel, config.signal);
					if (!promptBuilder.isFrozen()) {
						promptBuilder.setMemory(params.memoryRuntime.buildPrompt());
						promptBuilder.freeze();
					}
					const update = {
						...external,
						context: {
							...(external?.context ?? turnContext.context),
							systemPrompt: promptBuilder.getCached(),
						},
					};
					// pi 会继续原地追加下一条 assistant；重试必须保留本 turn 完成时的稳定快照。
					preparedContext = {
						...update.context,
						messages: [...update.context.messages],
					};
					preparedLoopConfig = {
						...currentLoopConfig,
						model: nextModel,
						reasoning: external?.thinkingLevel === undefined
							? currentLoopConfig.reasoning
							: external.thinkingLevel === "off"
								? undefined
								: external.thinkingLevel,
					};
					return update;
				},
			};
			activeLoopConfig = loopConfig;

			// #endregion
			// #region 重试协调

			let turn = 0;
			let retryAttempt = 0;
			let continuation = false;
			let liveContext = context;
			const canonicalMessages: AgentMessage[] = [];
			let persistenceAttempted = false;
			try {
				// 一个用户请求只产生一组 agent:start / complete|error 顶层生命周期。
				deps.eventBus.emit({ type: "agent:start", sessionId: sessionManager.id });

				for (;;) {
					preparedContext = undefined;
					preparedLoopConfig = undefined;
					// pi 会原地修改 Context；每个 attempt 必须使用独立消息数组。
					const attemptContext: AgentContext = {
						...liveContext,
						messages: [...liveContext.messages],
					};
					const stream = continuation
						? agentLoopContinue(
								attemptContext,
								activeLoopConfig,
								config.signal,
								streamFn,
							)
						: agentLoop(
								requestPrompts,
								attemptContext,
								activeLoopConfig,
								config.signal,
								streamFn,
							);
					let lastAssistant: AssistantMessage | undefined;

					// 桥接 turn/message/tool 事件；低层 agent_start/end 不直接结束顶层对话。
					for await (const event of stream) {
						if (event.type === "turn_start") turn++;
						let recoveredAttempt: number | undefined;
						if (event.type === "turn_end" && event.message.role === "assistant") {
							lastAssistant = event.message;
							if (
								event.message.stopReason !== "error" &&
								event.message.stopReason !== "aborted" &&
								retryAttempt > 0
							) {
								recoveredAttempt = retryAttempt;
								retryAttempt = 0;
							}
						}
						// 顶层 Conversation 生命周期只发一次，低层 attempt 生命周期不外泄。
						if (event.type === "agent_start" || event.type === "agent_end") continue;
						const vivlosEvents = mapAgentEvent(event, sessionManager.id, turn);
						for (const vivlosEvent of vivlosEvents) deps.eventBus.emit(vivlosEvent);
						if (recoveredAttempt !== undefined) {
							deps.eventBus.emit({
								type: "agent:retry_end",
								sessionId: sessionManager.id,
								success: true,
								attempt: recoveredAttempt,
							});
						}
					}

					// 失败 assistant 只用于重试判断，不进入 live context 或 canonical history。
					const attemptMessages = await stream.result();
					const failure = getTerminalFailure(attemptMessages) ??
						(lastAssistant?.stopReason === "error" || lastAssistant?.stopReason === "aborted"
							? lastAssistant
							: undefined);
					const validMessages = failure
						? removeTerminalFailure(attemptMessages)
						: attemptMessages;

					liveContext = preparedContext ?? {
						...liveContext,
						messages: [...liveContext.messages, ...validMessages],
					};
					if (preparedLoopConfig) activeLoopConfig = preparedLoopConfig;
					// transient Hint 可参与同一次重试，但永远不提交到 history.jsonl。
					canonicalMessages.push(
						...validMessages.filter(
							(message) => !isTransientMessage(message, transientIds),
						),
					);

					if (!failure) {
						// 最终成功：一次性提交所有有效消息，再结束顶层 Conversation。
						persistenceAttempted = true;
						persistCanonicalMessages(sessionManager, canonicalMessages);
						deps.eventBus.emit({
							type: "agent:complete",
							sessionId: sessionManager.id,
							finalMessage: findLastAssistantText(canonicalMessages),
						});
						return { messages: canonicalMessages, turns: turn };
					}

					const error = new Error(
						failure.errorMessage ?? `LLM ${failure.stopReason}`,
					);
					const aborted = config.signal?.aborted || failure.stopReason === "aborted";
					const canRetry = !aborted &&
						retryConfig.enabled &&
						retryAttempt < retryConfig.maxRetries &&
						isRetryableAgentError(failure, activeLoopConfig.model.contextWindow);

					if (!canRetry) {
						if (retryAttempt > 0) {
							deps.eventBus.emit({
								type: "agent:retry_end",
								sessionId: sessionManager.id,
								success: false,
								attempt: retryAttempt,
								finalError: error,
							});
						}
						if (hasDurableProgress(canonicalMessages)) {
							// Tool 等有效进展需要保留；纯失败请求不写入 history。
							persistenceAttempted = true;
							persistCanonicalMessages(sessionManager, canonicalMessages);
						}
						deps.eventBus.emit({
							type: "agent:error",
							sessionId: sessionManager.id,
							kind: aborted ? "aborted" : "error",
							error,
						});
						return { messages: canonicalMessages, turns: turn, error };
					}

					retryAttempt++;
					const delayMs = getRetryDelayMs(retryConfig.baseDelayMs, retryAttempt);
					deps.eventBus.emit({
						type: "agent:retry_start",
						sessionId: sessionManager.id,
						attempt: retryAttempt,
						maxAttempts: retryConfig.maxRetries,
						delayMs,
						error,
					});
					// 同一个用户 AbortSignal 同时控制退避和后续 Provider 请求。
					await waitForRetry(delayMs, config.signal);
					continuation = true;
				}
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				if (retryAttempt > 0) {
					deps.eventBus.emit({
						type: "agent:retry_end",
						sessionId: sessionManager.id,
						success: false,
						attempt: retryAttempt,
						finalError: error,
					});
				}
				if (!persistenceAttempted && hasDurableProgress(canonicalMessages)) {
					persistenceAttempted = true;
					persistCanonicalMessages(sessionManager, canonicalMessages);
				}
				deps.eventBus.emit({
					type: "agent:error",
					sessionId: sessionManager.id,
					kind: config.signal?.aborted ? "aborted" : "error",
					error,
				});
				return { messages: canonicalMessages, turns: turn, error };
			}

			// #endregion
		},

		// #region 压缩生命周期

		/** 重置压缩状态（session 切换/新建时调用） */
		resetCompaction() {
			compactionState.consecutiveNoOp = 0;
			compactionState.autoPaused = false;
			compactionState.lastSummary = null;
			promptBuilder.setCompactedHistory("");
			promptBuilder.invalidate();
		},

		/** 手动触发压缩（/compact 命令用，跳过阈值和防抖） */
		async compactNow(model: Model<Api>): Promise<CompactionResult> {
			deps.eventBus.emit({
				type: "compaction:started",
				sessionId: sessionManager.id,
			});
			const compactorDeps: CompactorDeps = {
				llm: deps.llm,
				model: resolveCompressionModel(deps.llm, compressionConfig, model),
				config: compressionConfig,
			};
			let compressed = false;
			let compactedCount = 0;
			try {
				const result = await compact({
					messages: [...sessionManager.getMessages()],
					contextWindow: model.contextWindow,
					deps: compactorDeps,
					state: compactionState,
					force: true,
				});
				if (!result.noOp) {
					sessionManager.replaceMessages(result.messages);
					promptBuilder.setCompactedHistory(result.summary);
					promptBuilder.invalidate();
					appendCompaction(sessionManager.filePath, {
						type: "compaction",
						summary: result.summary,
						compactedCount: result.compactedCount,
						timestamp: Date.now(),
					});
					compressed = true;
					compactedCount = result.compactedCount;
				}
				return result;
			} finally {
				deps.eventBus.emit({
					type: "compaction:ended",
					sessionId: sessionManager.id,
					compressed,
					compactedCount,
				});
			}
		},

		// #endregion
	};
}

// #region 规范消息辅助函数

type IdentifiedAgentMessage = AgentMessage & { readonly id: string };

function ensureMessageId(message: AgentMessage): IdentifiedAgentMessage {
	const existing = (message as AgentMessage & { id?: unknown }).id;
	if (typeof existing === "string" && existing.trim()) {
		return message as IdentifiedAgentMessage;
	}
	return { ...message, id: randomUUID() } as IdentifiedAgentMessage;
}

/** 判断结果消息是否为本次请求临时插入、禁止落盘的消息。 */
function isTransientMessage(
	message: AgentMessage,
	transientIds: ReadonlySet<string>,
): boolean {
	const id = (message as AgentMessage & { readonly id?: unknown }).id;
	return typeof id === "string" && transientIds.has(id);
}

function getTerminalFailure(messages: readonly AgentMessage[]): AssistantMessage | undefined {
	const last = messages[messages.length - 1];
	return last?.role === "assistant" &&
		(last.stopReason === "error" || last.stopReason === "aborted")
		? last
		: undefined;
}

function removeTerminalFailure(messages: readonly AgentMessage[]): AgentMessage[] {
	return getTerminalFailure(messages) ? messages.slice(0, -1) : [...messages];
}

function hasDurableProgress(messages: readonly AgentMessage[]): boolean {
	return messages.some(
		(message) => message.role === "assistant" || message.role === "toolResult",
	);
}

function persistCanonicalMessages(
	sessionManager: SessionManager,
	messages: readonly AgentMessage[],
): void {
	for (const message of messages) {
		if (
			message.role === "user" ||
			message.role === "assistant" ||
			message.role === "toolResult"
		) {
			sessionManager.appendMessage(message as Message);
		}
	}
}

function findLastAssistantText(messages: readonly AgentMessage[]): string {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role !== "assistant") continue;
		return message.content
			.filter((content): content is Extract<typeof content, { type: "text" }> =>
				content.type === "text")
			.map((content) => content.text)
			.join("");
	}
	return "";
}

// #endregion

// #region 压缩模型解析

/**
 * 解析压缩用的模型：config.model 为 null 时用当前模型，否则按 "provider/modelId" 解析。
 */
function resolveCompressionModel(
	llm: LLMClient,
	config: CompressionConfig,
	currentModel: Model<Api>,
): Model<Api> {
	if (!config.model) return currentModel;
	const slashIdx = config.model.indexOf("/");
	if (slashIdx < 0) return currentModel;
	const provider = config.model.slice(0, slashIdx);
	const modelId = config.model.slice(slashIdx + 1);
	return llm.getModel(provider, modelId) ?? currentModel;
}

// #endregion
