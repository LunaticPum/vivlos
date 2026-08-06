/**
 * L2 Indexer 测试。
 *
 * 使用临时 cwd（session JSONL）与临时 memory.db，
 * 验证幂等、增量水位、删除传播与空消息跳过。
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createL2Indexer } from "@vivlos/agent/memory/layers/l2/indexer.ts";
import { getL2Db } from "@vivlos/infra/storage/memory/l2-db.ts";
import { readL2Overview } from "@vivlos/infra/storage/memory/l2-overview.ts";
import { closeAll } from "@vivlos/infra/storage/db.ts";
import {
	appendEntry,
	createSession,
	ensureSession,
} from "@vivlos/infra/storage/session/index.ts";
import type { Database } from "bun:sqlite";

let root: string;
let previousCwd: string;
let db: Database;

beforeEach(() => {
	previousCwd = process.cwd();
	root = mkdtempSync(join(tmpdir(), "vivlos-l2-indexer-"));
	process.chdir(root);
	db = getL2Db(join(root, "memory.db"));
});

afterEach(() => {
	process.chdir(previousCwd);
	closeAll();
	try {
		rmSync(root, { recursive: true, force: true });
	} catch {
		// Windows 下 WAL 文件可能短暂占用，清理尽力而为
	}
});

interface TestMessage {
	role: "user" | "assistant" | "toolResult";
	text: string;
	timestamp: number;
}

/** 创建一个带消息的 session 文件，返回 sessionId。 */
function makeSession(messages: TestMessage[], name?: string): string {
	const { header, filePath } = createSession(name ?? null);
	ensureSession(header, filePath);
	for (const message of messages) {
		appendEntry(filePath, {
			type: "message",
			role: message.role,
			content: [{ type: "text", text: message.text }],
			timestamp: message.timestamp,
		});
	}
	return header.id;
}

function countMessages(database: Database, sessionId: string): number {
	const row = database
		.prepare("SELECT COUNT(*) AS count FROM l2_messages WHERE session_id = ?")
		.get(sessionId) as { count: number };
	return row.count;
}

function ftsCount(database: Database): number {
	const row = database
		.prepare("SELECT COUNT(*) AS count FROM l2_messages_fts")
		.get() as { count: number };
	return row.count;
}

describe("createL2Indexer", () => {
	it("索引 user/assistant/toolResult 文本消息", () => {
		const sessionId = makeSession([
			{ role: "user", text: "项目使用什么运行时？", timestamp: 1000 },
			{ role: "assistant", text: "项目使用 Bun 作为运行时。", timestamp: 2000 },
			{ role: "toolResult", text: "bun --version 输出 1.3.14", timestamp: 3000 },
		]);

		createL2Indexer(db).upsertSession(sessionId);

		expect(countMessages(db, sessionId)).toBe(3);
		const rows = db
			.prepare(
				"SELECT role, content FROM l2_messages WHERE session_id = ? ORDER BY line_no",
			)
			.all(sessionId) as { role: string; content: string }[];
		expect(rows.map((row) => row.role)).toEqual([
			"user",
			"assistant",
			"toolResult",
		]);
		expect(rows[1]?.content).toBe("项目使用 Bun 作为运行时。");
	});

	it("重复 upsert 幂等，不产生重复行", () => {
		const sessionId = makeSession([
			{ role: "user", text: "hello world", timestamp: 1000 },
		]);
		const indexer = createL2Indexer(db);

		indexer.upsertSession(sessionId);
		indexer.upsertSession(sessionId);

		expect(countMessages(db, sessionId)).toBe(1);
		expect(ftsCount(db)).toBe(1);
	});

	it("增量索引：只处理水位之后的新行", () => {
		const sessionId = makeSession([
			{ role: "user", text: "第一条消息", timestamp: 1000 },
		]);
		const indexer = createL2Indexer(db);
		indexer.upsertSession(sessionId);
		expect(countMessages(db, sessionId)).toBe(1);

		const sessions = db
			.prepare("SELECT file_path FROM l2_sessions WHERE session_id = ?")
			.get(sessionId) as { file_path: string };
		appendEntry(sessions.file_path, {
			type: "message",
			role: "assistant",
			content: [{ type: "text", text: "第二条消息" }],
			timestamp: 2000,
		});

		indexer.upsertSession(sessionId);

		expect(countMessages(db, sessionId)).toBe(2);
		const watermark = db
			.prepare("SELECT indexed_lines FROM l2_sessions WHERE session_id = ?")
			.get(sessionId) as { indexed_lines: number };
		expect(watermark.indexed_lines).toBe(3);
	});

	it("跳过空文本与 compaction 条目", () => {
		const { header, filePath } = createSession(null);
		ensureSession(header, filePath);
		appendEntry(filePath, {
			type: "message",
			role: "assistant",
			content: [{ type: "toolCall", id: "c1", name: "bash", arguments: {} }],
			timestamp: 1000,
		});
		appendEntry(filePath, {
			type: "compaction",
			summary: "压缩摘要",
			compactedCount: 5,
			timestamp: 2000,
		});
		appendEntry(filePath, {
			type: "message",
			role: "user",
			content: [{ type: "text", text: "   " }],
			timestamp: 3000,
		});

		createL2Indexer(db).upsertSession(header.id);

		expect(countMessages(db, header.id)).toBe(0);
	});

	it("removeSession 级联删除消息与 FTS 行", () => {
		const sessionId = makeSession([
			{ role: "user", text: "待删除的内容", timestamp: 1000 },
		]);
		const indexer = createL2Indexer(db);
		indexer.upsertSession(sessionId);
		expect(ftsCount(db)).toBe(1);

		indexer.removeSession(sessionId);

		expect(countMessages(db, sessionId)).toBe(0);
		expect(ftsCount(db)).toBe(0);
		const sessionRow = db
			.prepare("SELECT 1 FROM l2_sessions WHERE session_id = ?")
			.get(sessionId);
		expect(sessionRow).toBeNull();
	});

	it("upsert 不存在的 session 时清理残留索引", () => {
		const sessionId = makeSession([
			{ role: "user", text: "会被清理", timestamp: 1000 },
		]);
		const indexer = createL2Indexer(db);
		indexer.upsertSession(sessionId);
		expect(countMessages(db, sessionId)).toBe(1);

		const sessionRow = db
			.prepare("SELECT file_path FROM l2_sessions WHERE session_id = ?")
			.get(sessionId) as { file_path: string };
		rmSync(dirname(sessionRow.file_path), { recursive: true, force: true });
		indexer.upsertSession(sessionId);

		expect(countMessages(db, sessionId)).toBe(0);
	});

	it("backfill 按批次补齐所有 session", () => {
		const ids = [
			makeSession([{ role: "user", text: "会话一", timestamp: 1000 }]),
			makeSession([{ role: "user", text: "会话二", timestamp: 2000 }]),
			makeSession([{ role: "user", text: "会话三", timestamp: 3000 }]),
		];

		createL2Indexer(db).backfill(50);

		for (const id of ids) {
			expect(countMessages(db, id)).toBe(1);
		}
	});

	it("backfill 尊重批次上限", () => {
		for (let index = 0; index < 3; index++) {
			makeSession([
				{ role: "user", text: `消息 ${index}`, timestamp: 1000 + index },
			]);
		}

		createL2Indexer(db).backfill(1);

		const total = db
			.prepare("SELECT COUNT(*) AS count FROM l2_sessions")
			.get() as { count: number };
		expect(total.count).toBe(1);
	});
});

describe("readL2Overview", () => {
	it("空库返回零值", () => {
		const overview = readL2Overview(db);
		expect(overview).toEqual({
			sessionCount: 0,
			messageCount: 0,
			lastIndexedAt: null,
		});
	});

	it("索引后返回正确的会话数、消息数与最近时间", () => {
		makeSession([
			{ role: "user", text: "会话一的消息", timestamp: 1000 },
			{ role: "assistant", text: "会话一的回复", timestamp: 2000 },
		]);
		makeSession([
			{ role: "user", text: "会话二的消息", timestamp: 9000 },
		]);
		createL2Indexer(db).backfill();

		const overview = readL2Overview(db);

		expect(overview.sessionCount).toBe(2);
		expect(overview.messageCount).toBe(3);
		expect(overview.lastIndexedAt).toBe(9000);
	});

	it("删除 session 后计数回落", () => {
		const sessionId = makeSession([
			{ role: "user", text: "待删除", timestamp: 1000 },
		]);
		const indexer = createL2Indexer(db);
		indexer.backfill();
		expect(readL2Overview(db).messageCount).toBe(1);

		indexer.removeSession(sessionId);

		const overview = readL2Overview(db);
		expect(overview.sessionCount).toBe(0);
		expect(overview.messageCount).toBe(0);
	});
});
