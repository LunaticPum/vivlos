import { Database, type Database as DatabaseType } from "bun:sqlite";

const instances = new Map<string, DatabaseType>();

export function getDb(dbPath: string): DatabaseType {
	const existing = instances.get(dbPath);
	if (existing) return existing;

	const db = new Database(dbPath);
	db.run("PRAGMA journal_mode = WAL");
	db.run("PRAGMA foreign_keys = ON");

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
		CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
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

export function closeAll(): void {
	instances.forEach((db) => {
		try { db.run("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* ignore */ }
		db.close();
	});
	instances.clear();
}

export function closeDb(): void {
	closeAll();
}
