import { getDb } from "../db.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";

export interface MemoryEntry {
  readonly id: string;
  readonly content: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface MemoryRepository {
  readAllMemories(): MemoryEntry[];
  addMemory(content: string): void;
  replaceMemory(oldText: string, newText: string): void;
  removeMemory(oldText: string): void;
  setProfile(content: string): void;
  getProfile(): string;
}

export function createSqliteMemoryRepository(dbPath: string): MemoryRepository {
  const db = getDb(dbPath);

  const stmtReadAll = db.query(
    "SELECT id, content, created_at, updated_at FROM agent_memories ORDER BY updated_at ASC",
  );
  const stmtAdd = db.query(
    "INSERT INTO agent_memories (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
  );
  const stmtReplace = db.query(
    "UPDATE agent_memories SET content = ?, updated_at = ? WHERE content = ?",
  );
  const stmtRemove = db.query(
    "DELETE FROM agent_memories WHERE content = ?",
  );
  const stmtSetProfile = db.query(
    "UPDATE user_profile SET content = ?, updated_at = ? WHERE id = 'profile'",
  );
  const stmtGetProfile = db.query(
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
