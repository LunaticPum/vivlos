import type { Message } from "@earendil-works/pi-ai";
import { getDb } from "../db.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";

export interface SessionRepository {
  readonly sessionId: string;
  getMessages(): Message[];
  appendMessage(message: Message): void;
  clearMessages(): void;
}

export function createSqliteSessionRepository(
  dbPath: string,
  id?: string,
): SessionRepository {
  const db = getDb(dbPath);
  const sessionId = id ?? shortId();

  db.query(
    "INSERT OR IGNORE INTO sessions (id, created_at) VALUES (?, ?)",
  ).run(sessionId, Date.now());

  const stmtGet = db.query(
    "SELECT content, timestamp FROM messages WHERE session_id = ? ORDER BY id ASC",
  );
  const stmtAppend = db.query(
    "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
  );
  const stmtClear = db.query("DELETE FROM messages WHERE session_id = ?");

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
