import {
	agentLoop,
	type AgentContext,
	type AgentLoopConfig,
	type AgentMessage,
	type AgentTool,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Model, Api, Message } from "@earendil-works/pi-ai";
import { randomUUID } from "node:crypto";

import type { SessionManager } from "@vivlos/agent/session/index.ts";
import type {
	MemoryCommandContextController,
	MemorySnapshot,
} from "@vivlos/agent/memory/types.ts";
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
import { log } from "@vivlos/infra/logger/index.ts";

/**
 * agentLoop 创建参数--组合根注入的依赖集合。
 */
export interface CreateAgentLoopParams {
	/** LLM + EventBus 基础依赖 */
	readonly deps: AgentLoopDeps;

	/** MemorySnapshot -- session 启动/切换时构造可冻结的 Memory Prompt */
	readonly memorySnapshot: MemorySnapshot;
	readonly memoryCommandContext: MemoryCommandContextController;
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
 *   6. 启动 pi agentLoop
 *   7. 遍历事件流 -> 映射为 VivlosEvent -> 发到 eventbus
 *   8. 拿最终消息列表
 *   9. 追加新消息到 session
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
	const compressionConfig = loadConfig().compression;

	return {
		async run(
			userInput: string | AgentMessage[],
			config: LoopConfig,
		): Promise<LoopResult> {
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

			// --- 2. Lazy freeze: SP 未冻结时读 memory + 冻结（session 启动/切换/压缩后首次） ---
			if (!promptBuilder.isFrozen()) {
				const memoryBlock = params.memorySnapshot.buildPrompt();
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
			};

			let turn = 0;
			params.memoryCommandContext.begin(
				sessionManager.id,
				prompts.map(readMessageId),
			);
			try {
				// --- 6. 启动 agentLoop ---
				const stream = agentLoop(
					prompts,
					context,
					loopConfig,
					config.signal,
					streamFn,
				);

				// --- 7. 遍历事件流 -> 映射为 VivlosEvent -> 发到 eventbus ---
				for await (const event of stream) {
					if (event.type === "turn_start") {
						turn++;
						params.memoryCommandContext.setTurn(turn);
					}
					const vivlosEvents = mapAgentEvent(event, sessionManager.id, turn);
					for (const ve of vivlosEvents) deps.eventBus.emit(ve);
				}

				// --- 8. 拿最终消息列表 ---
				const newMessages = await stream.result();

				// --- 9. 追加新消息到 session ---
				for (const m of newMessages) {
					if (
						m.role === "user" ||
						m.role === "assistant" ||
						m.role === "toolResult"
					) {
						sessionManager.appendMessage(m as Message);
					}
				}

				return { messages: newMessages, turns: turn };
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				log("error", error.message, error);
				deps.eventBus.emit({
					type: "agent:error",
					sessionId: sessionManager.id,
					error,
				});
				return { messages: [], turns: turn, error };
			} finally {
				params.memoryCommandContext.clear();
			}
		},

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
	};
}

// #region Message provenance

type IdentifiedAgentMessage = AgentMessage & { readonly id: string };

function ensureMessageId(message: AgentMessage): IdentifiedAgentMessage {
	const existing = (message as AgentMessage & { id?: unknown }).id;
	if (typeof existing === "string" && existing.trim()) {
		return message as IdentifiedAgentMessage;
	}
	return { ...message, id: randomUUID() } as IdentifiedAgentMessage;
}

function readMessageId(message: AgentMessage): string {
	return (message as IdentifiedAgentMessage).id;
}

// #endregion

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
