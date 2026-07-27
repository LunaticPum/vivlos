/**
 * session 级 Memory 操作历史读取。
 *
 * 本脚本读取 Event Logger 追加的 JSONL，并向上层投影安全的主模型操作字段；
 * 同时保存该 session 已审视到的物理行位置。
 * 日志不是 Memory 状态源；当前事实始终以 memory.md 和 user.md 为准。
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import type { MemoryOperationEvent } from "@vivlos/infra/eventbus/index.ts";
import { err, ok, type Result } from "@vivlos/shared";

// #region 历史契约

export interface HistoryItem {
	readonly line: number;
	readonly action: "add" | "replace" | "remove";
	readonly outcome: MemoryOperationEvent["outcome"];
	readonly file: MemoryOperationEvent["file"];
	readonly before?: string;
	readonly after?: string;
	readonly reasonCode: string;
	readonly reason?: string;
	readonly errorCode?: string;
	readonly timestamp: number;
}

export type HistoryIssueCode =
	| "invalid_json"
	| "invalid_event"
	| "wrong_session";

/** issue 只记录位置和类型，禁止携带无法信任的日志原文。 */
export interface HistoryIssue {
	readonly line: number;
	readonly code: HistoryIssueCode;
}

export interface HistoryRead {
	readonly records: readonly HistoryItem[];
	readonly issues: readonly HistoryIssue[];
	readonly tail: number;
}

export interface History {
	read(after?: number): HistoryRead;
	readCursor(): number;
	saveCursor(line: number): number;
}

// #endregion

// #region History 主入口

/** 创建绑定到单个 session 的操作历史与游标。 */
export function createHistory(sessionDir: string, sessionId: string): History {
	if (!sessionId.trim()) throw new Error("sessionId 不能为空");
	const file = resolve(sessionDir, "memory-events.jsonl");
	const cursorFile = resolve(sessionDir, "memory-cursor.json");
	const tempFile = resolve(sessionDir, "memory-cursor.json.tmp");

	return {
		read(after = 0) {
			validateLine(after);
			const lines = readLines(file);
			const tail = lines.length;
			if (after > tail) throw new Error("after 不能超过日志尾行");

			const records: HistoryItem[] = [];
			const issues: HistoryIssue[] = [];
			for (let index = after; index < tail; index++) {
				const line = index + 1;
				const text = lines[index]!.trim();
				if (!text) continue;

				let value: unknown;
				try {
					value = JSON.parse(text);
				} catch {
					issues.push({ line, code: "invalid_json" });
					continue;
				}

				const parsed = parseEvent(value, line, sessionId);
				if (!parsed.ok) {
					issues.push(parsed.error);
					continue;
				}
				if (parsed.value) records.push(parsed.value);
			}

			return { records, issues, tail };
		},

		readCursor() {
			return readCursor(cursorFile);
		},

		saveCursor(line) {
			validateLine(line);
			const current = readCursor(cursorFile);
			if (line < current) throw new Error("cursor 不能回退");
			if (line > readLines(file).length) {
				throw new Error("cursor 不能超过日志尾行");
			}
			if (line === current) return current;

			mkdirSync(sessionDir, { recursive: true });
			try {
				writeFileSync(tempFile, `${JSON.stringify({ line })}\n`, "utf-8");
				renameSync(tempFile, cursorFile);
			} catch (error) {
				try {
					rmSync(tempFile, { force: true });
				} catch {
					// 保留原始保存错误；残留临时文件会在下次写入时覆盖。
				}
				throw error;
			}
			return line;
		},
	};
}

// #endregion

// #region Event 投影

type ParseResult = Result<HistoryItem | null, HistoryIssue>;

const MAIN_ACTIONS = new Set(["add", "replace", "remove"]);
const CONSOLIDATION_ACTIONS = new Set(["refine", "merge"]);
const OUTCOMES = new Set(["committed", "noop", "rejected"]);
const FILES = new Set(["memory", "user"]);

/** 验证所需结构并丢弃 Consolidator 操作和所有未知字段。 */
function parseEvent(value: unknown, line: number, sessionId: string): ParseResult {
	if (!isObject(value) || value.type !== "memory:operation") {
		return invalid(line);
	}
	if (!isText(value.sessionId)) return invalid(line);
	if (value.sessionId !== sessionId) {
		return err({ line, code: "wrong_session" });
	}

	const actor = value.actor;
	const action = value.action;
	if (
		(actor !== "main" && actor !== "consolidator") ||
		typeof action !== "string" ||
		(actor === "main" && !MAIN_ACTIONS.has(action)) ||
		(actor === "consolidator" && !CONSOLIDATION_ACTIONS.has(action)) ||
		!isText(value.eventId) ||
		typeof value.outcome !== "string" ||
		!OUTCOMES.has(value.outcome) ||
		typeof value.file !== "string" ||
		!FILES.has(value.file) ||
		!isText(value.reasonCode) ||
		!isText(value.revisionBefore) ||
		!isText(value.revisionAfter) ||
		!isTime(value.timestamp) ||
		!isOptionalText(value.before) ||
		!isOptionalText(value.after) ||
		!isOptionalText(value.reason, 200) ||
		!isOptionalText(value.errorCode)
	) {
		return invalid(line);
	}

	if (actor === "consolidator") return ok(null);

	const rejected = value.outcome === "rejected";
	return ok({
		line,
		action: action as HistoryItem["action"],
		outcome: value.outcome as HistoryItem["outcome"],
		file: value.file as HistoryItem["file"],
		...(!rejected && value.before !== undefined
			? { before: value.before as string }
			: {}),
		...(!rejected && value.after !== undefined
			? { after: value.after as string }
			: {}),
		reasonCode: value.reasonCode,
		...(value.reason !== undefined ? { reason: value.reason as string } : {}),
		...(value.errorCode !== undefined
			? { errorCode: value.errorCode as string }
			: {}),
		timestamp: value.timestamp,
	});
}

function invalid(line: number): ParseResult {
	return err({ line, code: "invalid_event" });
}

// #endregion

// #region 读取辅助

function splitLines(content: string): string[] {
	const lines = content.split(/\r?\n/);
	if (lines.at(-1) === "") lines.pop();
	return lines;
}

function readLines(file: string): string[] {
	return splitLines(existsSync(file) ? readFileSync(file, "utf-8") : "");
}

function readCursor(file: string): number {
	if (!existsSync(file)) return 0;

	let value: unknown;
	try {
		value = JSON.parse(readFileSync(file, "utf-8"));
	} catch {
		throw new Error("memory-cursor.json 不是有效 JSON");
	}
	if (
		!isObject(value) ||
		Object.keys(value).length !== 1 ||
		!("line" in value) ||
		!Number.isSafeInteger(value.line) ||
		(value.line as number) < 0
	) {
		throw new Error("memory-cursor.json 结构无效");
	}
	return value.line as number;
}

function validateLine(line: number): void {
	if (!Number.isSafeInteger(line) || line < 0) {
		throw new Error("line 必须是非负安全整数");
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown, max = Number.POSITIVE_INFINITY): value is string {
	return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isOptionalText(value: unknown, max?: number): boolean {
	return value === undefined || isText(value, max);
}

function isTime(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

// #endregion
