import type { AgentLoopConfig } from "@earendil-works/pi-agent-core";

/**
 * vivlos 可选的 loop 控制 hook 集合。
 *
 * 从 pi 的 AgentLoopConfig 里 Pick 出 hook 字段，
 * 不重新定义类型，保证和 pi 兼容。
 *
 * 使用方：CreateAgentLoopParams.hooks
 * 后续扩展：steering queue、follow-up queue、tool hooks 等
 * 都以工厂函数形式产出这里的字段，再传入 createAgentLoop。
 */
export type LoopHooks = Pick<
	AgentLoopConfig,
	| "shouldStopAfterTurn"
	| "getSteeringMessages"
	| "getFollowUpMessages"
	| "prepareNextTurn"
	| "beforeToolCall"
	| "afterToolCall"
>;
