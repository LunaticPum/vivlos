/**
 * Memory History 与 Cursor 测试。
 *
 * 使用真实临时文件验证 JSONL 物理行、安全投影和 cursor 持久化；不读取
 * memory.md/user.md，也不启动 Trigger、Runtime 或模型。
 */

import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createHistory } from "@vivlos/infra/storage/memory/history.ts";
import type { MemoryOperationEvent } from "@vivlos/infra/eventbus/index.ts";

const SESSION_ID = "history-session";

let sessionDir: string;
let eventFile: string;
let cursorFile: string;

beforeEach(() => {
	sessionDir = mkdtempSync(join(tmpdir(), "vivlos-memory-history-"));
	eventFile = join(sessionDir, "memory-events.jsonl");
	cursorFile = join(sessionDir, "memory-cursor.json");
});

afterEach(() => {
	rmSync(sessionDir, { recursive: true, force: true });
});

function event(
	overrides: Partial<MemoryOperationEvent> = {},
): MemoryOperationEvent {
	return {
		type: "memory:operation",
		eventId: "event-1",
		timestamp: 1,
		sessionId: SESSION_ID,
		actor: "main",
		action: "add",
		outcome: "committed",
		file: "memory",
		reasonCode: "explicit_user_request",
		after: "Safe fact.",
		revisionBefore: "revision-1",
		revisionAfter: "revision-2",
		...overrides,
	};
}

function writeEvents(values: readonly unknown[], newline = "\n"): void {
	writeFileSync(
		eventFile,
		`${values.map((value) => JSON.stringify(value)).join(newline)}${newline}`,
		"utf-8",
	);
}

// #region History 读取

describe("Memory History", () => {
	it("MEM-HIS-001 处理缺失文件、CRLF、空行和增量物理行", () => {
		const history = createHistory(sessionDir, SESSION_ID);
		expect(history.read()).toEqual({ records: [], issues: [], tail: 0 });

		const first = event({ eventId: "event-1", after: "First." });
		const third = event({ eventId: "event-3", after: "Third." });
		writeFileSync(
			eventFile,
			`${JSON.stringify(first)}\r\n\r\n${JSON.stringify(third)}\r\n`,
			"utf-8",
		);

		const all = history.read();
		expect(all.tail).toBe(3);
		expect(all.records.map((record) => [record.line, record.after])).toEqual([
			[1, "First."],
			[3, "Third."],
		]);
		expect(all.issues).toEqual([]);

		const incremental = history.read(1);
		expect(incremental.tail).toBe(3);
		expect(incremental.records).toHaveLength(1);
		expect(incremental.records[0]?.line).toBe(3);
	});

	it("MEM-HIS-002 只投影主模型必要字段并忽略未知字段", () => {
		const main = {
			...event({
			eventId: "main-event",
			action: "replace",
			file: "user",
			before: "Verbose preference.",
			after: "Preference.",
			reason: "简化表达",
		}),
			unknownPayload: "must be dropped",
			source: { sessionId: "other", historyLine: 99 },
		};
		const consolidator = event({
			eventId: "consolidator-event",
			actor: "consolidator",
			action: "refine",
		});
		writeEvents([main, consolidator]);

		const result = createHistory(sessionDir, SESSION_ID).read();
		expect(result.records).toEqual([
			{
				line: 1,
				action: "replace",
				outcome: "committed",
				file: "user",
				before: "Verbose preference.",
				after: "Preference.",
				reasonCode: "explicit_user_request",
				reason: "简化表达",
				timestamp: 1,
			},
		]);
		expect(JSON.stringify(result)).not.toContain("unknownPayload");
		expect(JSON.stringify(result)).not.toContain("must be dropped");
	});

	it("MEM-HIS-003 隔离坏行且不泄漏原文，并继续读取有效后续行", () => {
		const invalidJson = "INVALID_SECRET_JSON";
		const invalidEvent = {
			type: "memory:operation",
			sessionId: SESSION_ID,
			payload: "INVALID_EVENT_SECRET",
		};
		const wrongSession = event({
			eventId: "wrong-session",
			sessionId: "another-session",
			after: "WRONG_SESSION_SECRET",
		});
		const valid = event({ eventId: "valid-event", after: "Visible fact." });
		writeFileSync(
			eventFile,
			[
				invalidJson,
				JSON.stringify(invalidEvent),
				JSON.stringify(wrongSession),
				JSON.stringify(valid),
			].join("\n") + "\n",
			"utf-8",
		);

		const result = createHistory(sessionDir, SESSION_ID).read();
		expect(result.issues).toEqual([
			{ line: 1, code: "invalid_json" },
			{ line: 2, code: "invalid_event" },
			{ line: 3, code: "wrong_session" },
		]);
		expect(result.records).toHaveLength(1);
		expect(result.records[0]?.line).toBe(4);
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain(invalidJson);
		expect(serialized).not.toContain("INVALID_EVENT_SECRET");
		expect(serialized).not.toContain("WRONG_SESSION_SECRET");
	});

	it("MEM-HIS-004 rejected 记录强制丢弃 before/after", () => {
		const unsafe = "REJECTED_CANDIDATE_MUST_NOT_LEAK";
		writeEvents([
			event({
				eventId: "rejected-event",
				outcome: "rejected",
				before: unsafe,
				after: unsafe,
				errorCode: "prompt_injection",
				revisionAfter: "revision-1",
			}),
		]);

		const result = createHistory(sessionDir, SESSION_ID).read();
		expect(result.records[0]).toEqual({
			line: 1,
			action: "add",
			outcome: "rejected",
			file: "memory",
			reasonCode: "explicit_user_request",
			errorCode: "prompt_injection",
			timestamp: 1,
		});
		expect(JSON.stringify(result)).not.toContain(unsafe);
	});
});

// #endregion

// #region Cursor

describe("Memory Cursor", () => {
	it("MEM-CUR-001 懒创建、单行保存并可在重建后读回", () => {
		const history = createHistory(sessionDir, SESSION_ID);
		expect(history.readCursor()).toBe(0);
		expect(history.saveCursor(0)).toBe(0);
		expect(existsSync(cursorFile)).toBe(false);

		writeEvents([event()]);
		expect(history.saveCursor(1)).toBe(1);
		expect(readFileSync(cursorFile, "utf-8")).toBe('{"line":1}\n');
		expect(createHistory(sessionDir, SESSION_ID).readCursor()).toBe(1);
	});

	it("MEM-CUR-002 禁止非法值、回退和超过日志尾行", () => {
		writeEvents([event({ eventId: "event-1" }), event({ eventId: "event-2" })]);
		const history = createHistory(sessionDir, SESSION_ID);
		history.saveCursor(1);
		const before = readFileSync(cursorFile, "utf-8");

		expect(() => history.saveCursor(-1)).toThrow("非负安全整数");
		expect(() => history.saveCursor(1.5)).toThrow("非负安全整数");
		expect(() => history.saveCursor(0)).toThrow("cursor 不能回退");
		expect(() => history.saveCursor(3)).toThrow("cursor 不能超过日志尾行");
		expect(readFileSync(cursorFile, "utf-8")).toBe(before);
	});

	it("MEM-CUR-003 多次原子推进不残留临时文件，并拒绝损坏结构", () => {
		writeEvents([event({ eventId: "event-1" }), event({ eventId: "event-2" })]);
		const history = createHistory(sessionDir, SESSION_ID);
		history.saveCursor(1);
		history.saveCursor(2);

		expect(history.readCursor()).toBe(2);
		expect(existsSync(join(sessionDir, "memory-cursor.json.tmp"))).toBe(false);

		writeFileSync(cursorFile, "not-json", "utf-8");
		expect(() => history.readCursor()).toThrow("不是有效 JSON");
		writeFileSync(cursorFile, '{"line":1,"extra":true}\n', "utf-8");
		expect(() => history.readCursor()).toThrow("结构无效");
	});
});

// #endregion
