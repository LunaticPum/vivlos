import type { Message } from "@earendil-works/pi-ai";
import { getDb } from "../db.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";

/**
 * Session 仓储接口——infra 层的 CRUD 原语。
 *
 * infra 不知道 VivlosSession（agent 层业务接口），
 * 只提供消息的增删查清。agent 层的 session-manager 委托此接口实现 VivlosSession。
 */
export interface SessionRepository {
	readonly sessionId: string;
	getMessages(): Message[];
	appendMessage(message: Message): void;
	clearMessages(): void;
}

/**
 * 创建基于 SQLite 的 SessionRepository。
 *
 * content 列存完整 Message JSON（round-trip 安全）。
 */
export function createSqliteSessionRepository(
	dbPath: string,
	id?: string,
): SessionRepository {
	const db = getDb(dbPath);
	const sessionId = id ?? shortId();

	// 确保 session 行存在
	db.prepare(
		"INSERT OR IGNORE INTO sessions (id, created_at) VALUES (?, ?)",
	).run(sessionId, Date.now());

	// 预编译 prepared statements
	const stmtGet = db.prepare(
		"SELECT content, timestamp FROM messages WHERE session_id = ? ORDER BY id ASC",
	);
	const stmtAppend = db.prepare(
		"INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
	);
	const stmtClear = db.prepare("DELETE FROM messages WHERE session_id = ?");

	return {
		sessionId,

		getMessages() {
			const rows = stmtGet.all(sessionId) as Array<{
				content: string;
				timestamp: number;
			}>;

			return rows.map((row) => {
				const msg = JSON.parse(row.content) as Message;
				return { ...msg, timestamp: msg.timestamp || row.timestamp };
			});
		},

		appendMessage(message) {
			const contentRaw = JSON.stringify(message);
			stmtAppend.run(sessionId, message.role, contentRaw, message.timestamp);
		},

		clearMessages() {
			stmtClear.run(sessionId);
		},
	};
}
