import { getDb } from "@vivlos/infra/storage/db.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";
import type { MemoryBackend, MemoryEntry } from "./types.ts";

/**
 * SQLite MemoryBackend 实现。
 *
 * 使用 infra/storage/db.ts 里的 agent_memories 和 user_profile 表。
 */
export function createSQLiteMemoryBackend(dbPath: string): MemoryBackend {
	const db = getDb(dbPath);

	// ── prepared statements ──
	const readAllMemory = db.prepare(
		"SELECT id, content, created_at, updated_at FROM agent_memories ORDER BY updated_at ASC",
	);
	const addMemory = db.prepare(
		"INSERT INTO agent_memories (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
	);
	const replaceMemory = db.prepare(
		"UPDATE agent_memories SET content = ?, updated_at = ? WHERE content = ?",
	);
	const removeMemory = db.prepare(
		"DELETE FROM agent_memories WHERE content = ?",
	);
	const setProfile = db.prepare(
		"UPDATE user_profile SET content = ?, updated_at = ? WHERE id = 'profile'",
	);
	const getProfile = db.prepare(
		"SELECT content FROM user_profile WHERE id = 'profile'",
	);

	return {
		async readAll(target) {
			if (target === "user") {
				const row = getProfile.get() as { content: string } | undefined;
				return row
					? [
							{
								id: "profile",
								content: row.content,
								createdAt: 0,
								updatedAt: 0,
							},
						]
					: [];
			}
			const rows = readAllMemory.all() as Array<{
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

		async add(_target, content) {
			const now = Date.now();
			addMemory.run(shortId(), content, now, now);
		},

		async replace(_target, oldText, newText) {
			replaceMemory.run(newText, Date.now(), oldText);
		},

		async remove(_target, oldText) {
			removeMemory.run(oldText);
		},

		async setProfile(content) {
			setProfile.run(content, Date.now());
		},

		async getProfile() {
			const row = getProfile.get() as { content: string } | undefined;
			return row?.content ?? "";
		},
	};
}
