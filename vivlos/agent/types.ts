import type { Model, Api, Message } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { LLMClient } from "@vivlos/infra/llm/types.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";

/**
 * agent 运行时上下文
 *
 * TODO: 目前 agent-loop.ts 直接用 pi 的 AgentContext，此类型暂未使用。
 * 保留是为了 P5 加 tools 后可能需要扩展 pi 的 Context（注入 vivlos 工具集），
 * 届时用此类型替代 pi 的 AgentContext。
 */
export interface VivlosAgentContext {
	readonly systemPrompt: string;
	readonly messages: AgentMessage[];
	readonly tools: readonly never[];
}

/** agent loop 配置 */
export interface VivlosLoopConfig {
	readonly model: Model<Api>;
	readonly maxTurns: number;
	readonly signal?: AbortSignal;
}

/** agent loop 运行结果 */
export interface VivlosLoopResult {
	readonly messages: AgentMessage[];
	readonly turns: number;
	readonly error?: Error;
}

/** agent loop 依赖注入 */
export interface AgentLoopDeps {
	readonly llm: LLMClient;
	readonly eventBus: EventBus;
}

/** agent 对外接口 —— entries 层 */
export interface VivlosAgent {
	prompt(input: string | AgentMessage[]): Promise<VivlosLoopResult>;
	getMessages(): readonly Message[];
	reset(): void;
}
