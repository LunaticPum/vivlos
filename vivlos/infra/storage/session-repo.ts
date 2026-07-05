import type { Message } from "@earendil-works/pi-ai";
import type { VivlosSession } from "@vivlos/agent/session/types.ts";
import type { Database as DatabaseType } from "better-sqlite3";
import { getDb } from "./db.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";

/**
 * 基于 SQLite 的 session 存储。
 *
 * 替代 P3 的 createMemorySession() 实现，
 * 消息持久化到 SQLite 的 messages 表。
 *
 * content 列存储完整 Message 对象的 JSON：
 *   appendMessage → JSON.stringify(message)
 *   getMessages   → JSON.parse → Message
 * 这样 round-trip 安全，且保留了 usage/stopReason/toolCallId 等所有字段。
 *
 * TODO: 后续完善方向——
 * - 分页查询（getMessages 加 offset/limit）
 * - session 列表/搜索/删除
 * - 消息总数/最后活跃时间缓存（避免每次 COUNT）
 */
export function createSqliteSession(dbPath: string, id?: string): VivlosSession {
	const db = getDb(dbPath);
	const sessionId = id ?? shortId();

	// 确保 session 行存在
	db.prepare(
		"INSERT OR IGNORE INTO sessions (id, created_at) VALUES (?, ?)"
	).run(sessionId, Date.now());

	// 预编译 prepared statements（热路径性能）
	const stmtGet = db.prepare(
		"SELECT content, timestamp FROM messages WHERE session_id = ? ORDER BY id ASC"
	);
	const stmtAppend = db.prepare(
		"INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)"
	);
	const stmtReset = db.prepare(
		"DELETE FROM messages WHERE session_id = ?"
	);

	return {
		id: sessionId,

		getMessages() {
			const rows = stmtGet.all(sessionId) as Array<{
				content: string;
				timestamp: number;
			}>;

			return rows.map((row) => {
				// content 是完整 Message JSON，反序列化还原
				const msg = JSON.parse(row.content) as Message;
				// timestamp 优先用行级时间戳（保证顺序），content 内的 timestamp 为备用
				return { ...msg, timestamp: msg.timestamp || row.timestamp };
			});
		},

		appendMessage(message: Message) {
			const contentRaw = JSON.stringify(message);
			stmtAppend.run(sessionId, message.role, contentRaw, message.timestamp);
		},

		reset() {
			stmtReset.run(sessionId);
		},
	};
}
