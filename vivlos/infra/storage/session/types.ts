import type { Message } from "@earendil-works/pi-ai";

/** Session 文件第 1 行 header */
export interface SessionHeader {
	type: "session";
	version: number;
	id: string;
	createdAt: string;
	name: string | null;
}

/** Message entry -- pi-ai Message + type 标记 */
export interface MessageEntry {
	type: "message";
	role: "user" | "assistant" | "toolResult";
	content: unknown;
	timestamp: number;
	[key: string]: unknown;
}

/** 所有 entry 类型的 union（未来扩展 compaction / label） */
export type SessionEntry = MessageEntry;

/** Session 列表项元信息 */
export interface SessionMeta {
	id: string;
	name: string | null;
	createdAt: number;
	lastActiveAt: number;
	messageCount: number;
	/** 对话轮数（user message 条数） */
	turnCount: number;
	/** 上下文 token 总量（最后一条 assistant 的 usage） */
	totalTokens: number;
	filePath: string;
}

/** 从 Message 构造 MessageEntry */
export function toMessageEntry(msg: Message): MessageEntry {
	return { type: "message", ...msg };
}

/** 从 MessageEntry 还原 Message（去掉 type 字段） */
export function toMessage(entry: MessageEntry): Message {
	const { type, ...rest } = entry;
	return rest as unknown as Message;
}
