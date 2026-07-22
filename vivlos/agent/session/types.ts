import type { Message } from "@earendil-works/pi-ai";
import type { SessionMeta } from "@vivlos/infra/storage/session/index.ts";

/**
 * Session 业务接口（agent 层定义）。
 *
 * 封装消息存储、增删查管 + 多 session 管理。
 * 内部委托 infra 层的 JSONL repo 做文件 I/O。
 */
export interface SessionManager {
	readonly id: string;
	/** 当前 session 的名称（null 表示未命名） */
	readonly name: string | null;
	readonly filePath: string;

	// ── 当前 session 消息 ──
	getMessages(): readonly Message[];
	appendMessage(message: Message): void;

	// ── 多 session 管理 ──
	/** 列出所有 session */
	listSessions(): SessionMeta[];
	/** 切换到另一个 session */
	switchTo(sessionId: string): void;
	/** 创建新 session 并切换 */
	createNew(name?: string): void;
	/** 删除 session */
	deleteSession(sessionId: string): void;
	/** 重命名当前 session */
	rename(name: string): void;
}
