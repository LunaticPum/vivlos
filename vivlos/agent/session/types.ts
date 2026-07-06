import type { Message } from "@earendil-works/pi-ai";

/**
 * Session 业务接口（agent 层定义）。
 *
 * 和 MemoryManager 对等——封装消息存储、增删查管。
 * 内部委托 infra 层的 SessionRepository 做 CRUD。
 *
 * 数据条目是 pi-ai 的 Message（UserMessage / AssistantMessage / ToolResultMessage），
 * 和 memory 层的 MemoryEntry 对等。
 */
export interface SessionManager {
	readonly id: string;
	getMessages(): readonly Message[];
	appendMessage(message: Message): void;
	reset(): void;
}