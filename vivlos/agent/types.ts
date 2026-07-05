import type { Model, Api, Message } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { LLMClient } from "@vivlos/infra/llm/types.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";

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
