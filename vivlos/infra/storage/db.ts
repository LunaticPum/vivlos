import Database, { type Database as DatabaseType } from "better-sqlite3";

const instances = new Map<string, DatabaseType>();

/**
 * 获取 SQLite 连接（按 dbPath 键控，同一 path 只打开一次）。
 *
 * 自动建表（schema migration）。
 * 表结构：
 *   sessions      — 会话元数据
 *   messages      — 对话消息
 *   agent_memories — agent memory（参考 Hermes MEMORY.md）
 *   user_profile   — 用户画像（参考 Hermes USER.md）
 */
export function getDb(dbPath: string): DatabaseType {
	const existing = instances.get(dbPath);
	if (existing) return existing;

	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");

	// ── schema ──
	db.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			timestamp INTEGER NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_messages_session
			ON messages(session_id, id);

		CREATE TABLE IF NOT EXISTS agent_memories (
			id TEXT PRIMARY KEY,
			content TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS user_profile (
			id TEXT PRIMARY KEY DEFAULT 'profile',
			content TEXT NOT NULL DEFAULT '',
			updated_at INTEGER NOT NULL DEFAULT 0
		);

		INSERT OR IGNORE INTO user_profile (id, content, updated_at)
			VALUES ('profile', '', 0);
	`);

	instances.set(dbPath, db);
	return db;
}

/** 关闭所有数据库连接并 WAL checkpoint */
export function closeAll(): void {
	for (const [path, db] of instances) {
		try {
			db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		} catch { /* ignore checkpoint errors */ }
		db.close();
	}
	instances.clear();
}

/** @deprecated 使用 closeAll() 关闭所有连接 */
export function closeDb(): void {
	closeAll();
}
