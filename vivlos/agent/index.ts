import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, Api } from "@earendil-works/pi-ai";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import { createPromptBuilder, type PromptBuilder } from "./prompt/index.ts";
import { createSession, type VivlosSession } from "./session/index.ts";
import {
	createAgentLoop,
	createMaxTurnsHook,
	type VivlosLoopHooks,
} from "./loop/index.ts";
import type { VivlosAgent, VivlosLoopResult } from "./types.ts";
import type { MemoryManager } from "./memory/types.ts";

export interface CreateAgentParams {
	readonly llm: LLMClient;
	readonly eventBus: EventBus;
	readonly model: Model<Api>;
	readonly promptBuilder?: PromptBuilder;
	readonly session?: VivlosSession;
	readonly maxTurns?: number;
	readonly hooks?: VivlosLoopHooks;
	/** 工具列表，透传到 agent-loop → AgentContext.tools */
	readonly tools?: AgentTool<any, any>[];
	/**
	 * MemoryManager，每次 prompt 前注入记忆到 system prompt。
	 * 可选——不传则跳过 memory 注入。
	 */
	readonly memoryManager?: MemoryManager;
}

export function createAgent(params: CreateAgentParams): VivlosAgent {
	const session = params.session ?? createSession();
	const promptBuilder = params.promptBuilder ?? createPromptBuilder();
	const maxTurns = params.maxTurns ?? 10;

	const hooks: VivlosLoopHooks = {
		// 内置 hook
		...createMaxTurnsHook(maxTurns),
		// 外置 hook
		...params.hooks,
	};

	const loop = createAgentLoop({
		deps: { llm: params.llm, eventBus: params.eventBus },
		session,
		promptBuilder,
		hooks,
		tools: params.tools,
		memoryManager: params.memoryManager,
	});
	const model = params.model;

	return {
		async prompt(input: string | AgentMessage[]): Promise<VivlosLoopResult> {
			return loop.run(input, { model, maxTurns });
		},
		getMessages() {
			return session.getMessages();
		},
		reset() {
			session.reset();
		},
	};
}

export * from "./types.ts";
export * from "./prompt/index.ts";
export * from "./session/index.ts";
export * from "./loop/index.ts";