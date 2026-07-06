import type { Message } from "@earendil-works/pi-ai";

/**
 * Session 业务接口（agent 层定义）。
 *
 * infra 层提供 SessionRepository（CRUD 原语），
 * session-manager 内部委托 repo 实现 VivlosSession。
 */
export interface VivlosSession {
	readonly id: string;
	getMessages(): readonly Message[];
	appendMessage(message: Message): void;
	reset(): void;
}

export interface SessionBackend {
	getMessages(): readonly Message[];
	appendMessage(message: Message): void;
	reset(): void;
}
