/**
 * Memory L2 索引数据库（bun:sqlite + FTS5）。
 *
 * memory.db 是纯索引：任何时候可以从各 session 目录的 history.jsonl 全量重建，
 * 删除本文件不丢数据。与主 vivlos.db 分离，便于独立清理。
 *
 * Schema 设计见 docs/memory/S2-L2会话检索规范.md。
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../db.ts";
import { getMemoryDbPath } from "../../paths.ts";

/**
 * L2 模块表结构定义。
 *
 * - l2_sessions：每个 session 的索引水位（indexed_lines）。
 * - l2_messages：可索引消息文本，(session_id, line_no) 唯一。
 * - l2_messages_fts：external-content FTS5，触发器同步增删改。
 */
export function initL2Schema(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS l2_sessions (
			session_id     TEXT PRIMARY KEY,
			name           TEXT,
			created_at     INTEGER,
			last_active_at INTEGER,
			file_path      TEXT NOT NULL,
			message_count  INTEGER NOT NULL DEFAULT 0,
			indexed_lines  INTEGER NOT NULL DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS l2_messages (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL
				REFERENCES l2_sessions(session_id) ON DELETE CASCADE,
			line_no    INTEGER NOT NULL,
			role       TEXT NOT NULL,
			content    TEXT NOT NULL,
			tokens     TEXT NOT NULL,
			timestamp  INTEGER,
			UNIQUE(session_id, line_no)
		);

		CREATE INDEX IF NOT EXISTS idx_l2_messages_session
			ON l2_messages(session_id);

		CREATE VIRTUAL TABLE IF NOT EXISTS l2_messages_fts USING fts5(
			tokens,
			content='l2_messages',
			content_rowid='id'
		);

		CREATE TRIGGER IF NOT EXISTS l2_messages_ai
		AFTER INSERT ON l2_messages BEGIN
			INSERT INTO l2_messages_fts(rowid, tokens)
			VALUES (new.id, new.tokens);
		END;

		CREATE TRIGGER IF NOT EXISTS l2_messages_ad
		AFTER DELETE ON l2_messages BEGIN
			INSERT INTO l2_messages_fts(l2_messages_fts, rowid, tokens)
			VALUES ('delete', old.id, old.tokens);
		END;

		CREATE TRIGGER IF NOT EXISTS l2_messages_au
		AFTER UPDATE ON l2_messages BEGIN
			INSERT INTO l2_messages_fts(l2_messages_fts, rowid, tokens)
			VALUES ('delete', old.id, old.tokens);
			INSERT INTO l2_messages_fts(rowid, tokens)
			VALUES (new.id, new.tokens);
		END;
	`);
}

/**
 * 获取 L2 索引数据库连接（已建表）。
 *
 * 复用 db.ts 的连接管理（WAL、foreign_keys、统一关闭）。
 * 可选传入自定义路径（测试用）。
 */
export function getL2Db(dbPath?: string): Database {
	const db = getDb(dbPath ?? getMemoryDbPath());
	initL2Schema(db);
	return db;
}
