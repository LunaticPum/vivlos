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
 * TODO: 后续完善方向——
 * - content JSON 序列化改为结构化列（role/content/timestamp 直接存，复杂 content 用 JSONB）
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

	return {
		id: sessionId,

		getMessages() {
			const rows = db
				.prepare(
					"SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY id ASC"
				)
				.all(sessionId) as Array<{
					role: string;
					content: string;
					timestamp: number;
				}>;

			// content 在 DB 中为 JSON 字符串，反序列化还原为原始类型。
			// 消息的 content 可能是 string（纯文本 user 消息）或数组（多 content block）。
			// 用 unknown 中转避开 Message 的 discriminated union 类型限制。
			return rows.map((row) => {
				let parsedContent: unknown;
				try {
					parsedContent = JSON.parse(row.content);
				} catch {
					parsedContent = row.content;
				}
				return {
					role: row.role,
					content: parsedContent,
					timestamp: row.timestamp,
				} as Message;
			});
		},

		appendMessage(message: Message) {
			const contentRaw =
				typeof message.content === "string"
					? message.content
					: JSON.stringify(message.content);

			db.prepare(
				"INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)"
			).run(sessionId, message.role, contentRaw, message.timestamp);
		},

		reset() {
			db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
		},
	};
}
