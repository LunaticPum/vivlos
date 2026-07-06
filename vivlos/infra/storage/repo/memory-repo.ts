import { getDb } from "../db.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";

/** memory 条目的存储格式（infra 层定义，agent 层 re-export） */
export interface MemoryEntry {
	readonly id: string;
	readonly content: string;
	readonly createdAt: number;
	readonly updatedAt: number;
}

/**
 * Memory 仓储接口——infra 层的 CRUD 原语。
 *
 * infra 不知道 MemoryManager（agent 层业务接口），
 * 只提供记忆和用户画像的增删查改。agent 层的 manager 委托此接口。
 */
export interface MemoryRepository {
	// ── memory CRUD ──
	readAllMemories(): MemoryEntry[];
	addMemory(content: string): void;
	replaceMemory(oldText: string, newText: string): void;
	removeMemory(oldText: string): void;

	// ── user profile ──
	setProfile(content: string): void;
	getProfile(): string;
}

/**
 * 创建基于 SQLite 的 MemoryRepository。
 *
 * 使用 agent_memories 和 user_profile 表。
 */
export function createSqliteMemoryRepository(dbPath: string): MemoryRepository {
	const db = getDb(dbPath);

	// ── prepared statements ──
	const stmtReadAll = db.prepare(
		"SELECT id, content, created_at, updated_at FROM agent_memories ORDER BY updated_at ASC",
	);
	const stmtAdd = db.prepare(
		"INSERT INTO agent_memories (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
	);
	const stmtReplace = db.prepare(
		"UPDATE agent_memories SET content = ?, updated_at = ? WHERE content = ?",
	);
	const stmtRemove = db.prepare(
		"DELETE FROM agent_memories WHERE content = ?",
	);
	const stmtSetProfile = db.prepare(
		"UPDATE user_profile SET content = ?, updated_at = ? WHERE id = 'profile'",
	);
	const stmtGetProfile = db.prepare(
		"SELECT content FROM user_profile WHERE id = 'profile'",
	);

	return {
		readAllMemories() {
			const rows = stmtReadAll.all() as Array<{
				id: string;
				content: string;
				created_at: number;
				updated_at: number;
			}>;
			return rows.map((r) => ({
				id: r.id,
				content: r.content,
				createdAt: r.created_at,
				updatedAt: r.updated_at,
			}));
		},

		addMemory(content) {
			const now = Date.now();
			stmtAdd.run(shortId(), content, now, now);
		},

		replaceMemory(oldText, newText) {
			stmtReplace.run(newText, Date.now(), oldText);
		},

		removeMemory(oldText) {
			stmtRemove.run(oldText);
		},

		setProfile(content) {
			stmtSetProfile.run(content, Date.now());
		},

		getProfile() {
			const row = stmtGetProfile.get() as { content: string } | undefined;
			return row?.content ?? "";
		},
	};
}