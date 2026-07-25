import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, Api, ThinkingLevel } from "@earendil-works/pi-ai";

import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";

import { createPromptBuilder, type PromptBuilder } from "./prompt/index.ts";
import { createSessionManager, type SessionManager } from "./session/index.ts";
import { createMaxTurnsHook, type LoopHooks } from "./loop/hooks/index.ts";
import { createAgentLoop, type LoopResult } from "./loop/index.ts";

import type { VivlosAgent } from "./types.ts";
import type { MemoryManager, MemoryStore } from "./memory/types.ts";

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

	/** MemoryManager——每次 prompt 前注入记忆块到 system prompt */
	readonly memoryManager: MemoryManager;
	/** MemoryStore——memory tool 与 Dreaming 共用的安全读写入口 */
	readonly memoryStore: MemoryStore;
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
 * - 合并内置 hook（maxTurns）+ 外部 hook
 * - 创建 agentLoop 并包装为 VivlosAgent 公共接口
 */
export function createAgent(params: CreateAgentParams): VivlosAgent {
	const model = params.model;
	const maxTurns = params.maxTurns ?? 10;

	const memoryManager = params.memoryManager;
	const sessionManager = params.sessionManager ?? createSessionManager();
	const promptBuilder = params.promptBuilder ?? createPromptBuilder();
	const hooks: LoopHooks = {
		// 内置 hook
		...createMaxTurnsHook(maxTurns),
		// 外部 hook（steering / follow-up 等）
		...params.hooks,
	};
	const tools = params.tools;

	const loop = createAgentLoop({
		deps: { llm: params.llm, eventBus: params.eventBus },
		memoryManager,
		memoryStore: params.memoryStore,
		sessionManager,
		promptBuilder,
		hooks,
		tools,
	});

	return {
		async prompt(input: string | AgentMessage[], signal?: AbortSignal): Promise<LoopResult> {
			const currentModel = params.llm.getModel(
				params.llm.getDefaultProvider(),
				params.llm.getDefaultModelId(),
			) ?? model;
			return loop.run(input, { model: currentModel, maxTurns, reasoning: params.thinkingLevel, signal });
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
			loop.resetCompaction();
			params.toolsReset?.();
		},
		createNewSession(name?: string) {
			sessionManager.createNew(name);
			loop.resetCompaction();
			params.toolsReset?.();
		},
		deleteSession(sessionId: string) {
			sessionManager.deleteSession(sessionId);
		},
		renameSession(name: string) {
			sessionManager.rename(name);
		},
	};
}

export * from "./types.ts";
export * from "./prompt/index.ts";
export * from "./session/index.ts";
export * from "./loop/index.ts";
