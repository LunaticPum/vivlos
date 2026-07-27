/**
 * L1 Memory 纯领域逻辑。
 *
 * 本脚本只根据当前 entries 计算下一状态，不读取文件、不执行安全扫描、
 * 不检查字符上限，也不发布 Event。所有操作都必须保持输入数组不可变。
 */

import { err, ok, type Result } from "@vivlos/shared";
import type { MemoryFile } from "@vivlos/infra/storage/memory/repository.ts";

// #region 主动记忆命令

/** 主模型可提交的主动记忆命令。 */
export type MainMemoryCommand =
	| {
			readonly action: "add";
			readonly file: MemoryFile;
			readonly content: string;
	  }
	| {
			readonly action: "replace";
			readonly file: MemoryFile;
			readonly oldText: string;
			readonly newText: string;
	  }
	| {
			readonly action: "remove";
			readonly file: MemoryFile;
			readonly oldText: string;
	  };

// #endregion

// #region 领域结果

/** Logic 成功结果；changed 必须与 status 保持一致。 */
export interface MemoryLogicValue {
	readonly status: "committed" | "noop";
	readonly changed: boolean;
	readonly entries: readonly string[];
	readonly before?: string;
	readonly after?: string;
}

/** 主动记忆 Logic 当前可能返回的预期业务错误。 */
export interface MemoryLogicError {
	readonly code: "invalid_input" | "not_found" | "ambiguous_match";
	readonly message: string;
}

export type MemoryLogicResult = Result<MemoryLogicValue, MemoryLogicError>;

// #endregion

// #region 统一入口

/** 根据 action 执行一次主动记忆操作。 */
export function applyMainCommand(
	entries: readonly string[],
	command: MainMemoryCommand,
): MemoryLogicResult {
	switch (command.action) {
		case "add":
			return addEntry(entries, command.content);
		case "replace":
			return replaceEntry(entries, command.oldText, command.newText);
		case "remove":
			return removeEntry(entries, command.oldText);
	}
}

// #endregion

// #region Add

/**
 * 在 entries 末尾追加一条规范化内容。
 *
 * 精确重复属于成功 no-op；函数不会修改调用方传入的 entries。
 */
export function addEntry(
	entries: readonly string[],
	rawContent: string,
): MemoryLogicResult {
	const content = rawContent.trim();
	if (!content) {
		return err({
			code: "invalid_input",
			message: "add 需要非空 content",
		});
	}

	if (entries.includes(content)) {
		return ok({
			status: "noop",
			changed: false,
			entries,
			before: content,
			after: content,
		});
	}

	return ok({
		status: "committed",
		changed: true,
		entries: [...entries, content],
		after: content,
	});
}

// #endregion

// #region Replace

/**
 * 唯一定位 oldText，并替换命中 entry 中的对应子串。
 *
 * 如果最终内容已经由其他 entry 保存，则移除旧 entry 并保留现有目标，
 * 确保纠正生效且不会制造精确重复。
 */
export function replaceEntry(
	entries: readonly string[],
	rawOldText: string,
	rawNewText: string,
): MemoryLogicResult {
	const oldText = rawOldText.trim();
	const newText = rawNewText.trim();
	if (!oldText || !newText) {
		return err({
			code: "invalid_input",
			message: "replace 需要非空 oldText 和 newText；删除请使用 remove",
		});
	}

	const matchResult = findUniqueMatch(entries, oldText);
	if (!matchResult.ok) return matchResult;

	const { entryIndex, offset } = matchResult.value;
	const before = entries[entryIndex]!;
	const after = `${before.slice(0, offset)}${newText}${before.slice(
		offset + oldText.length,
	)}`.trim();

	if (after === before) {
		return ok({
			status: "noop",
			changed: false,
			entries,
			before,
			after,
		});
	}

	const targetExists = entries.some(
		(entry, index) => index !== entryIndex && entry === after,
	);
	if (targetExists) {
		return ok({
			status: "committed",
			changed: true,
			entries: entries.filter((_, index) => index !== entryIndex),
			before,
			after,
		});
	}

	const nextEntries = [...entries];
	nextEntries[entryIndex] = after;
	return ok({
		status: "committed",
		changed: true,
		entries: nextEntries,
		before,
		after,
	});
}

// #endregion

// #region Remove

/**
 * 唯一定位 oldText，并删除包含该子串的完整 entry。
 *
 * 删除最后一条时返回空数组；实际空文件写入由 Repository 负责。
 */
export function removeEntry(
	entries: readonly string[],
	rawOldText: string,
): MemoryLogicResult {
	const oldText = rawOldText.trim();
	if (!oldText) {
		return err({
			code: "invalid_input",
			message: "remove 需要非空 oldText",
		});
	}

	const matchResult = findUniqueMatch(entries, oldText);
	if (!matchResult.ok) return matchResult;

	const before = entries[matchResult.value.entryIndex]!;
	return ok({
		status: "committed",
		changed: true,
		entries: entries.filter(
			(_, index) => index !== matchResult.value.entryIndex,
		),
		before,
	});
}

// #endregion

// #region 唯一匹配

interface EntryMatch {
	readonly entryIndex: number;
	readonly offset: number;
}

/**
 * 在全部 entries 的文本内部定位唯一一次 oldText 局部子串。
 *
 * 匹配不要求 oldText 等于完整 entry；成功时同时返回 entry 索引和 entry
 * 内部 offset。同一 entry 内多次或重叠出现也属于 ambiguous。
 */
function findUniqueMatch(
	entries: readonly string[],
	oldText: string,
): Result<EntryMatch, MemoryLogicError> {
	let match: EntryMatch | null = null;

	for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
		const entry = entries[entryIndex]!;
		let searchFrom = 0;
		while (searchFrom <= entry.length - oldText.length) {
			const offset = entry.indexOf(oldText, searchFrom);
			if (offset < 0) break;
			if (match) {
				return err({
					code: "ambiguous_match",
					message: `oldText 匹配多处，请提供更具体的内容："${oldText}"`,
				});
			}
			match = { entryIndex, offset };
			searchFrom = offset + 1;
		}
	}

	if (!match) {
		return err({
			code: "not_found",
			message: `未找到匹配 oldText 的内容："${oldText}"`,
		});
	}
	return ok(match);
}

// #endregion
