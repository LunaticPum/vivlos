import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
	MemoryFile,
	MemoryLimits,
	MemoryMutationResult,
	MemoryStore,
	MemoryStoreErrorCode,
} from "./types.ts";

// #region Markdown 格式与安全规则

/** 文件条目之间使用独立的 --- 行分隔 */
const SEPARATOR = "\n---\n";
const SEPARATOR_LINE = /^[ \t]*---[ \t]*$/m;

/** 会改变未来 session 行为的常见 prompt injection 模式 */
const INJECTION_PATTERNS: RegExp[] = [
	/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
	/you\s+are\s+now\s+/i,
	/disregard\s+(all\s+)?(previous|prior|above)/i,
	/system\s*:\s*/i,
	/\[INST\]|\[\/INST\]|<<SYS>>|<\|im_start\|>/i,
];

/** 不允许持久化到 system prompt 的常见凭证模式 */
const CREDENTIAL_PATTERNS: RegExp[] = [
	/BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY/i,
	/\bsk-[a-zA-Z0-9]{20,}/,
	/\bapi[_-]?key\s*[:=]\s*\S+/i,
	/\bpassword\s*[:=]\s*\S+/i,
	/\bsecret\s*[:=]\s*\S+/i,
	/\bAKIA[0-9A-Z]{16}/,
];

/** 人眼难以审计、但可能改变模型输入语义的不可见字符 */
const INVISIBLE_UNICODE = /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/;

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
		read,

		add(file, rawContent) {
			const content = rawContent.trim();
			const validation = validateContent(content);
			if (validation) return validation;

			const entries = read(file);
			if (entries.includes(content)) {
				return success("duplicate", file, content, usage(file, entries));
			}

			const nextEntries = [...entries, content];
			const capacityError = checkCapacity(nextEntries, capFor(file));
			if (capacityError) return capacityError;

			writeEntries(filePath(file), nextEntries);
			return success("written", file, content, usage(file, nextEntries));
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
			const validation = validateContent(content);
			if (validation) return validation;

			const nextEntries = [...entries];
			nextEntries[index] = content;
			const capacityError = checkCapacity(nextEntries, capFor(file));
			if (capacityError) return capacityError;

			writeEntries(filePath(file), nextEntries);
			return success("written", file, content, usage(file, nextEntries));
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
			return success("written", file, content!, usage(file, nextEntries));
		},

		getUsage(file) {
			return usage(file);
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
	return raw.split(SEPARATOR).map((entry) => entry.trim()).filter(Boolean);
}

/** 序列化后的长度是 cap 与 usage 的唯一计算口径 */
function serialize(entries: string[]): string {
	return entries.length > 0 ? `${entries.join(SEPARATOR)}\n` : "";
}

/** 覆盖写入规范化内容；空列表会生成真正的空文件 */
function writeEntries(filePath: string, entries: string[]): void {
	mkdirSync(resolve(filePath, ".."), { recursive: true });
	writeFileSync(filePath, serialize(entries), "utf-8");
}

// #endregion

// #region 内容与操作校验

/** 拒绝空内容、分隔符注入、prompt injection、凭证与隐藏字符 */
function validateContent(content: string): MemoryMutationResult | null {
	if (!content) return failure("invalid_input", "记忆内容不能为空");
	if (SEPARATOR_LINE.test(content)) {
		return failure("invalid_input", "记忆内容不能包含独立的 --- 分隔行");
	}

	for (const pattern of INJECTION_PATTERNS) {
		if (pattern.test(content)) {
			return failure("unsafe_content", `检测到 prompt injection 模式 (${pattern.source})`);
		}
	}
	for (const pattern of CREDENTIAL_PATTERNS) {
		if (pattern.test(content)) {
			return failure("unsafe_content", `检测到凭证模式 (${pattern.source})`);
		}
	}
	if (INVISIBLE_UNICODE.test(content)) {
		return failure("unsafe_content", "检测到不可见 Unicode 字符");
	}
	return null;
}

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
	content: string,
	usage: { used: number; cap: number },
): MemoryMutationResult {
	return { ok: true, value: { status, file, content, usage } };
}

function failure(
	code: MemoryStoreErrorCode,
	message: string,
): MemoryMutationResult {
	return { ok: false, error: { code, message } };
}

// #endregion
