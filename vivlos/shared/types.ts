/** 单次 LLM 对话的 Token 用量 */
export interface TokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** agent 基本配置 */
export interface AgentConfig {
	/** 每次 agent loop 的最大循环次数 */
	masTurns: number;
	/** LLM 模型 ID */
	modelId: string;
}

/** 所有消息渠道的统一消息格式 */
export interface ChannelMessage {
	channel: string;
	senderId: string;
	text: string;
	timestamp: number;
}
