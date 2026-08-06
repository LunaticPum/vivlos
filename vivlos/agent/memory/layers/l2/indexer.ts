/**
 * L2 Indexer：history.jsonl → memory.db 的幂等同步。
 *
 * history.jsonl 是权威源，memory.db 只是可重建索引。
 * 每个 session 维护 indexed_lines 水位，只解析水位之后的新行。
 *
 * 见 docs/memory/S2-L2会话检索规范.md。
 */

import { readFileSync, existsSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { getL2Db } from "@vivlos/infra/storage/memory/l2-db.ts";
import {
	listSessions,
	type SessionMeta,
} from "@vivlos/infra/storage/session/index.ts";
import { log } from "@vivlos/infra/logger/index.ts";
import { expandForIndex } from "./tokenize.ts";

// #region 契约

export interface L2Indexer {
	/** 增量索引单个 session；session 不存在时清理其索引。 */
	upsertSession(sessionId: string): void;
	/** 删除单个 session 的索引（级联删除消息与 FTS 行）。 */
	removeSession(sessionId: string): void;
	/** 启动回填：按最近活跃顺序补齐落后的 session，单批有上限。 */
	backfill(limit?: number): void;
}

// #endregion

// #region 消息文本抽取

interface ParsedMessage {
	readonly role: string;
	readonly content: string;
	readonly timestamp: number | null;
}

/** 从 content blocks 提取 text 块文本（跳过 thinking / toolCall / 图片）。 */
function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (
			typeof block === "object" && block !== null &&
			(block as { type?: unknown }).type === "text" &&
			typeof (block as { text?: unknown }).text === "string"
		) {
			parts.push((block as { text: string }).text);
		}
	}
	return parts.join("");
}

/** 解析单行 JSONL；非 message 条目或无法解析时返回 null。 */
function parseMessageLine(line: string): ParsedMessage | null {
	let entry: unknown;
	try {
		entry = JSON.parse(line);
	} catch {
		return null;
	}
	if (typeof entry !== "object" || entry === null) return null;
	const record = entry as Record<string, unknown>;
	if (record.type !== "message") return null;
	const role = record.role;
	if (role !== "user" && role !== "assistant" && role !== "toolResult") {
		return null;
	}
	const content = extractText(record.content);
	if (!content.trim()) return null;
	const timestamp = typeof record.timestamp === "number"
		? record.timestamp
		: null;
	return { role, content, timestamp };
}

// #endregion

// #region 工厂

const DEFAULT_BACKFILL_LIMIT = 50;

export function createL2Indexer(db?: Database): L2Indexer {
	const database = db ?? getL2Db();

	const stmtGetWatermark = database.prepare(
		"SELECT indexed_lines FROM l2_sessions WHERE session_id = ?",
	);
	const stmtUpsertSession = database.prepare(`
		INSERT INTO l2_sessions
			(session_id, name, created_at, last_active_at, file_path,
			 message_count, indexed_lines)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
			name = excluded.name,
			created_at = excluded.created_at,
			last_active_at = excluded.last_active_at,
			file_path = excluded.file_path,
			message_count = excluded.message_count,
			indexed_lines = excluded.indexed_lines
	`);
	const stmtInsertMessage = database.prepare(`
		INSERT OR IGNORE INTO l2_messages
			(session_id, line_no, role, content, tokens, timestamp)
		VALUES (?, ?, ?, ?, ?, ?)
	`);
	const stmtRemoveSession = database.prepare(
		"DELETE FROM l2_sessions WHERE session_id = ?",
	);
	const stmtCountMessages = database.prepare(
		"SELECT COUNT(*) AS count FROM l2_messages WHERE session_id = ?",
	);

	const upsertFromMeta = (meta: SessionMeta): void => {
		if (!existsSync(meta.filePath)) {
			stmtRemoveSession.run(meta.id);
			return;
		}

		const watermarkRow = stmtGetWatermark.get(meta.id) as
			| { indexed_lines: number }
			| undefined;
		const watermark = watermarkRow?.indexed_lines ?? 0;

		const lines = readFileSync(meta.filePath, "utf-8").split("\n");
		// 末尾空行不算内容行
		const totalLines = lines[lines.length - 1] === ""
			? lines.length - 1
			: lines.length;
		if (totalLines <= watermark) {
			// 无新行，仅同步元信息（name 可能已更新）
			const count = (stmtCountMessages.get(meta.id) as { count: number })
				.count;
			stmtUpsertSession.run(
				meta.id,
				meta.name,
				meta.createdAt,
				meta.lastActiveAt,
				meta.filePath,
				count,
				watermark,
			);
			return;
		}

		const runIndexed = () => {
			// 先确保 session 行存在（满足 l2_messages 外键），最后回写水位
			stmtUpsertSession.run(
				meta.id,
				meta.name,
				meta.createdAt,
				meta.lastActiveAt,
				meta.filePath,
				0,
				watermark,
			);
			for (
				let lineNo = watermark + 1;
				lineNo <= totalLines;
				lineNo++
			) {
				const parsed = parseMessageLine(lines[lineNo - 1]!);
				if (!parsed) continue;
				stmtInsertMessage.run(
					meta.id,
					lineNo,
					parsed.role,
					parsed.content,
					expandForIndex(parsed.content),
					parsed.timestamp,
				);
			}
			const count = (stmtCountMessages.get(meta.id) as { count: number })
				.count;
			stmtUpsertSession.run(
				meta.id,
				meta.name,
				meta.createdAt,
				meta.lastActiveAt,
				meta.filePath,
				count,
				totalLines,
			);
		};
		database.exec("BEGIN");
		try {
			runIndexed();
			database.exec("COMMIT");
		} catch (error) {
			database.exec("ROLLBACK");
			throw error;
		}
	};

	return {
		upsertSession(sessionId) {
			const meta = listSessions().find((item) => item.id === sessionId);
			if (!meta) {
				stmtRemoveSession.run(sessionId);
				return;
			}
			upsertFromMeta(meta);
		},

		removeSession(sessionId) {
			stmtRemoveSession.run(sessionId);
		},

		backfill(limit = DEFAULT_BACKFILL_LIMIT) {
			const sessions = listSessions().slice(0, limit);
			for (const meta of sessions) {
				try {
					upsertFromMeta(meta);
				} catch (error) {
					const cause = error instanceof Error
						? error
						: new Error(String(error));
					log("warn", `L2 回填失败 session=${meta.id}: ${cause.message}`, cause);
				}
			}
		},
	};
}

// #endregion
