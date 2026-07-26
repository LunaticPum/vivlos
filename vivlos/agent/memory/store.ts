import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

import type {
	MemoryFile,
	MemoryLimits,
	MemoryMutationResult,
	MemoryStore,
	MemoryStoreErrorCode,
	MemoryStoreSnapshot,
} from "./types.ts";

// #region Markdown 格式

/** 文件条目之间使用独立的 --- 行分隔 */
const SEPARATOR = "\n---\n";
const SEPARATOR_PATTERN = /\r?\n---\r?\n/;

// #endregion

// #region Store 主入口

/** 创建 Markdown Memory 的统一读写入口。 */
export function createMemoryStore(
	memoriesDir: string,
	limits: MemoryLimits,
): MemoryStore {
	const filePath = (file: MemoryFile) => resolve(memoriesDir, `${file}.md`);
	const capFor = (file: MemoryFile) => limits[file];

	const read = (file: MemoryFile): string[] => readEntries(filePath(file));
	const usage = (file: MemoryFile, entries = read(file)) => ({
		used: serialize(entries).length,
		cap: capFor(file),
	});

	return {
		readSnapshot() {
			return createSnapshot(read("memory"), read("user"), limits);
		},

		add(file, rawContent) {
			const content = rawContent.trim();
			if (!content) return failure("invalid_input", "记忆内容不能为空");

			const entries = read(file);
			if (entries.includes(content)) {
				return success("duplicate", file, content, content, usage(file, entries));
			}

			const nextEntries = [...entries, content];
			const capacityError = checkCapacity(nextEntries, capFor(file));
			if (capacityError) return capacityError;

			writeEntries(filePath(file), nextEntries);
			return success("written", file, undefined, content, usage(file, nextEntries));
		},

		replace(file, rawOldText, rawNewText) {
			const oldText = rawOldText.trim();
			const newText = rawNewText.trim();
			if (!oldText || !newText) {
				return failure("invalid_input", "replace 需要非空的 old_text 和 new_text；删除条目请使用 remove");
			}

			const entries = read(file);
			const matches = matchingIndexes(entries, oldText);
			const matchError = validateMatches(matches, oldText);
			if (matchError) return matchError;

			const index = matches[0]!;
			const content = entries[index]!.replace(oldText, newText).trim();
			if (
				content === entries[index] ||
				entries.some((entry, entryIndex) => entryIndex !== index && entry === content)
			) {
				return success(
					"duplicate",
					file,
					entries[index],
					entries[index],
					usage(file, entries),
				);
			}

			const nextEntries = [...entries];
			nextEntries[index] = content;
			const capacityError = checkCapacity(nextEntries, capFor(file));
			if (capacityError) return capacityError;

			writeEntries(filePath(file), nextEntries);
			return success(
				"written",
				file,
				entries[index],
				content,
				usage(file, nextEntries),
			);
		},

		remove(file, rawOldText) {
			const oldText = rawOldText.trim();
			if (!oldText) return failure("invalid_input", "remove 需要非空的 old_text");

			const entries = read(file);
			const matches = matchingIndexes(entries, oldText);
			const matchError = validateMatches(matches, oldText);
			if (matchError) return matchError;

			const nextEntries = [...entries];
			const [content] = nextEntries.splice(matches[0]!, 1);
			writeEntries(filePath(file), nextEntries);
			return success("written", file, content!, undefined, usage(file, nextEntries));
		},
	};
}

// #endregion

// #region Markdown 文件读写

/** 将 Markdown 文件解析为规范化的条目列表 */
function readEntries(filePath: string): string[] {
	if (!existsSync(filePath)) return [];
	const raw = readFileSync(filePath, "utf-8").trim();
	if (!raw) return [];
	return raw.split(SEPARATOR_PATTERN).map((entry) => entry.trim()).filter(Boolean);
}

/** 序列化后的长度是 cap 与 usage 的唯一计算口径 */
function serialize(entries: string[]): string {
	return entries.length > 0 ? `${entries.join(SEPARATOR)}\n` : "";
}

/**
 * 从同一次读取结果构造双文件快照。
 * revision 只依赖规范化内容，不受多余首尾空白影响。
 */
function createSnapshot(
	memoryEntries: string[],
	userEntries: string[],
	limits: MemoryLimits,
): MemoryStoreSnapshot {
	const memoryContent = serialize(memoryEntries);
	const userContent = serialize(userEntries);
	const revision = createHash("sha256")
		.update(memoryContent)
		.update("\0")
		.update(userContent)
		.digest("hex");

	return {
		entries: { memory: memoryEntries, user: userEntries },
		usage: {
			memory: { used: memoryContent.length, cap: limits.memory },
			user: { used: userContent.length, cap: limits.user },
		},
		revision: `sha256:${revision}`,
	};
}

/** 覆盖写入规范化内容；空列表会生成真正的空文件 */
function writeEntries(filePath: string, entries: string[]): void {
	mkdirSync(resolve(filePath, ".."), { recursive: true });
	writeFileSync(filePath, serialize(entries), "utf-8");
}

// #endregion

// #region 内容与操作校验

/** 返回包含指定子串的全部条目下标，用于检测模糊匹配 */
function matchingIndexes(entries: string[], oldText: string): number[] {
	const matches: number[] = [];
	for (let index = 0; index < entries.length; index++) {
		if (entries[index]!.includes(oldText)) matches.push(index);
	}
	return matches;
}

/** replace/remove 必须且只能命中一条记忆 */
function validateMatches(
	matches: number[],
	oldText: string,
): MemoryMutationResult | null {
	if (matches.length === 0) return failure("not_found", `未找到匹配 "${oldText}" 的条目`);
	if (matches.length > 1) {
		return failure("ambiguous_match", `"${oldText}" 匹配了 ${matches.length} 条，请写得更具体`);
	}
	return null;
}

/** 写盘前按最终序列化内容检查字符上限 */
function checkCapacity(entries: string[], cap: number): MemoryMutationResult | null {
	const used = serialize(entries).length;
	if (used > cap) {
		return failure("capacity_exceeded", `写入后将达到 ${used}/${cap} 字符，请先删除或精简已有条目`);
	}
	return null;
}

// #endregion

// #region 操作结果构造

function success(
	status: "written" | "duplicate",
	file: MemoryFile,
	before: string | undefined,
	after: string | undefined,
	usage: { used: number; cap: number },
): MemoryMutationResult {
	return { ok: true, value: { status, file, before, after, usage } };
}

function failure(
	code: MemoryStoreErrorCode,
	message: string,
): MemoryMutationResult {
	return { ok: false, error: { code, message } };
}

// #endregion
