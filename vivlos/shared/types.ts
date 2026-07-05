/** 单次 LLM 对话的 Token 用量 */
export interface TokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

import type { Message } from "@earendil-works/pi-ai";

/** session 持久化接口（P6 接入，infra + agent 层共用） */
export interface VivlosSession {
	readonly id: string;
	getMessages(): readonly Message[];
	appendMessage(message: Message): void;
	reset(): void;
}
