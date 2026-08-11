import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, Api, ThinkingLevel } from "@earendil-works/pi-ai";

import type { EventBus, TodoList } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type {
	MemoryRuntime,
	MemoryCoordinator,
} from "@vivlos/agent/memory/index.ts";
import type { Result } from "@vivlos/shared";

import { createPromptBuilder, type PromptBuilder } from "./prompt/index.ts";
import {
	createSessionManager,
	generateSessionTitle,
	readTitleInput,
	type SessionManager,
} from "./session/index.ts";
import type { LoopHooks } from "./loop/hooks/index.ts";
import { createAgentLoop, type LoopResult } from "./loop/index.ts";
import { log } from "@vivlos/infra/logger/index.ts";
import { buildTodoHint } from "./tools/advanced/todo/hint.ts";
import { createSteeringQueue } from "./steering/queue.ts";

import type { VivlosAgent } from "./types.ts";

/**
 * agent 组合根参数。
 *
 * 所有依赖在此聚合，createAgent 负责装配并返回 VivlosAgent 实例。
 */
export interface CreateAgentParams {
	/** LLM 客户端——封装 pi-ai 的模型查询 + 流式调用 */
	readonly llm: LLMClient;
	/** 事件总线——agent 内部事件（text:delta / tool:call 等）的全部出口 */
	readonly eventBus: EventBus;
	/** 默认 LLM 模型实例 */
	readonly model: Model<Api>;

	/** 当前 session 的 Memory 运行时 */
	readonly memoryRuntime: MemoryRuntime;
	/** Memory 生命周期协调器（可选）；分发 beforeTurn/afterTurn/sessionDelete 钩子 */
	readonly memoryCoordinator?: MemoryCoordinator;
	/** PromptBuilder——组装 system prompt（可选，默认用内置模板） */
	readonly promptBuilder?: PromptBuilder;
	/** SessionManager——消息存储管理器（可选，默认内存实现） */
	readonly sessionManager?: SessionManager;
	/** 可选 loop 控制 hook（steering / follow-up 等，后续扩展用） */
	readonly hooks?: LoopHooks;
	/** 工具列表--传入 AgentContext.tools，由 pi agentLoop 调度 tool calling */
	readonly tools?: AgentTool<any, any>[];
	/** 工具状态重置函数（/clear 时调用，清理 skill loadedSkills 等） */
	readonly toolsReset?: () => void;
	/** 读取当前 Session Todo；实际目录由组合根在每次调用时解析。 */
	readonly readTodoList?: () => Result<TodoList | null, Error>;

	/** agent loop 最大轮次（默认 10） */
	readonly maxTurns?: number;
	/** 推理等级（默认 undefined = pi 默认 "off"，需显式传入才启用 thinking） */
	readonly thinkingLevel?: ThinkingLevel;
}

/**
 * 创建 VivlosAgent 实例（组合根）。
 *
 * 职责：
 * - 装配 session / prompt / tools / memory 各组件
 * - 注入外部 loop hook；maxTurns 由主循环按请求处理
 * - 创建 agentLoop 并包装为 VivlosAgent 公共接口
 */
export function createAgent(params: CreateAgentParams): VivlosAgent {
	const model = params.model;
	const maxTurns = params.maxTurns ?? 10;

	const sessionManager = params.sessionManager ?? createSessionManager();
	const promptBuilder = params.promptBuilder ?? createPromptBuilder();
	const tools = params.tools;
	const titleTasks = new Set<string>();

	// Steering 队列：运行中插话；steering + followUp 双钩子共用排空
	const steeringQueue = createSteeringQueue({
		eventBus: params.eventBus,
		getSessionId: () => sessionManager.id,
	});
	const steeringHooks: LoopHooks = {
		...params.hooks,
		getSteeringMessages: async () => steeringQueue.drain(),
		getFollowUpMessages: async () => steeringQueue.drain(),
	};
	/** 安全读取当前 Session Todo；undefined 表示未配置或读取失败。 */
	const readCurrentTodoList = (): TodoList | null | undefined => {
		if (!params.readTodoList) return undefined;
		try {
			const result = params.readTodoList();
			if (result.ok) return result.value;
			log("warn", result.error.message, result.error);
		} catch (error) {
			const cause = error instanceof Error ? error : new Error(String(error));
			log("warn", `读取 Todo List 失败: ${cause.message}`, cause);
		}
		return undefined;
	};

	const loop = createAgentLoop({
		deps: { llm: params.llm, eventBus: params.eventBus },
		memoryRuntime: params.memoryRuntime,
		sessionManager,
		promptBuilder,
		hooks: steeringHooks,
		tools,
	});
	const publishSessionState = () => {
		params.eventBus.emit({
			type: "session:state",
			state: {
				current: {
					id: sessionManager.id,
					name: sessionManager.name,
					pending: sessionManager.pending,
					messages: [...sessionManager.getMessages()],
				},
				sessions: sessionManager.listSessions(),
			},
		});
	};
	params.eventBus.on("session:state_requested", publishSessionState);
	const requestTitle = (sessionId: string, input: string, titleModel: Model<Api>) => {
		if (titleTasks.has(sessionId)) return;
		titleTasks.add(sessionId);
		void generateSessionTitle({
			llm: params.llm,
			model: titleModel,
			input,
		}).then((name) => {
			if (sessionManager.renameIfUnnamed(sessionId, name)) {
				params.eventBus.emit({
					type: "session:renamed",
					sessionId,
					name,
					source: "auto",
				});
				publishSessionState();
			}
		}).catch((error) => {
			log(
				"warn",
				`Session 自动标题失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}).finally(() => {
			titleTasks.delete(sessionId);
		});
	};

	return {
		async prompt(
			input: string | AgentMessage[],
			signal?: AbortSignal,
			modelOverride?: Model<Api>,
		): Promise<LoopResult> {
			const currentModel = modelOverride ?? (params.llm.getModel(
				params.llm.getDefaultProvider(),
				params.llm.getDefaultModelId(),
			) ?? model);
			const sessionId = sessionManager.id;
			const titleInput = readTitleInput(input);
			const shouldTitle = titleInput.length > 0 &&
				sessionManager.name === null &&
				sessionManager.getMessages().length === 0;
			const sessionActivated = sessionManager.activate();
			const memoryActivation = params.memoryRuntime.activate();
			if (
				sessionActivated ||
				memoryActivation.memoryCreated ||
				memoryActivation.userCreated
			) {
				params.eventBus.emit({
					type: "session:activated",
					sessionId,
				});
				publishSessionState();
			}
			const todoList = readCurrentTodoList();
			const transientMessages: AgentMessage[] = todoList === undefined
				? []
				: [{
						role: "user",
						content: [{ type: "text", text: buildTodoHint(todoList) }],
						timestamp: Date.now(),
					}];
			if (params.memoryCoordinator) {
				await params.memoryCoordinator.beforeTurn({
					sessionId,
					userText: readTitleInput(input),
				});
			}
			let result: LoopResult;
			try {
				result = await loop.run(input, {
					model: currentModel,
					maxTurns,
					reasoning: params.thinkingLevel,
					signal,
					transientMessages,
				});
			} finally {
				// run 结束兜底：丢弃未消费的排队消息（正常流程队列已被排空，
				// 此步 no-op；中止/报错时清掉残留，防止被下一轮静默注入）。
				steeringQueue.clear();
			}

			if (params.memoryCoordinator) {
				await params.memoryCoordinator.afterTurn({ sessionId });
			}

			if (!result.error && shouldTitle) {
				requestTitle(sessionId, titleInput, currentModel);
			}
			publishSessionState();

			return result;
		},
		async compact() {
			const currentModel = params.llm.getModel(
				params.llm.getDefaultProvider(),
				params.llm.getDefaultModelId(),
			) ?? model;
			return loop.compactNow(currentModel);
		},
		getMessages() {
			return sessionManager.getMessages();
		},
		getTodoList() {
			return readCurrentTodoList() ?? null;
		},
		queueMessage(text) {
			return steeringQueue.push(text);
		},
		getSessionId() {
			return sessionManager.id;
		},
		getSessionName() {
			return sessionManager.name;
		},
		listSessions() {
			return sessionManager.listSessions();
		},
		switchSession(sessionId: string) {
			sessionManager.switchTo(sessionId);
			params.memoryRuntime.reset();
			loop.resetCompaction();
			params.toolsReset?.();
			params.eventBus.emit({
				type: "session:switched",
				sessionId: sessionManager.id,
			});
			publishSessionState();
		},
		createNewSession(name?: string) {
			sessionManager.createNew(name);
			params.memoryRuntime.reset();
			loop.resetCompaction();
			params.toolsReset?.();
			params.eventBus.emit({
				type: "session:created",
				sessionId: sessionManager.id,
			});
			publishSessionState();
		},
		deleteSession(sessionId: string) {
			const previousSessionId = sessionManager.id;
			if (!sessionManager.deleteSession(sessionId)) return;
			if (sessionManager.id !== previousSessionId) {
				params.memoryRuntime.reset();
				loop.resetCompaction();
				params.toolsReset?.();
			}
			if (params.memoryCoordinator) {
				void params.memoryCoordinator.sessionDelete(sessionId);
			}
			params.eventBus.emit({
				type: "session:deleted",
				sessionId,
			});
			publishSessionState();
		},
		renameSession(name: string) {
			const sessionId = sessionManager.id;
			sessionManager.rename(name);
			params.eventBus.emit({
				type: "session:renamed",
				sessionId,
				name,
				source: "user",
			});
			publishSessionState();
		},
	};
}

export * from "./types.ts";
export * from "./prompt/index.ts";
export * from "./session/index.ts";
export * from "./loop/index.ts";
