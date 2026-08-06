/**
 * L1 Memory 巩固纯领域逻辑。
 *
 * 本脚本只执行单次 refine 或 merge，不读取文件、不扫描内容、不发布 Event。
 * Consolidator 只能压缩已有 entries，不能借巩固操作添加或删除独立事实。
 */

import { err, ok, type Result } from "@vivlos/shared";
import type { MemoryFile } from "@vivlos/infra/storage/memory/repository.ts";

// #region 记忆巩固命令

/** 精炼一条完整 entry。 */
export interface RefineCommand {
	readonly action: "refine";
	readonly oldEntry: string;
	readonly newEntry: string;
}

/** 将同一文件中的多个完整 entries 合并为一条。 */
export interface MergeCommand {
	readonly action: "merge";
	readonly oldEntries: readonly string[];
	readonly newEntry: string;
}

export type ConsolidationCommand = RefineCommand | MergeCommand;

/** Service 接收的完整巩固命令；file 只用于选择对应 entries。 */
export type ConsolidationMemoryCommand = ConsolidationCommand & {
	readonly file: MemoryFile;
};

// #endregion

// #region 领域结果

/** 单次巩固成功结果；before/after 始终是完整 entry。 */
export interface ConsolidationLogicValue {
	readonly status: "committed" | "noop";
	readonly changed: boolean;
	readonly entries: readonly string[];
	readonly before: readonly string[];
	readonly after: string;
}

/** 单次巩固可能返回的预期业务错误。 */
export interface ConsolidationLogicError {
	readonly code:
		| "invalid_input"
		| "not_found"
		| "ambiguous_match"
		| "duplicate_target"
		| "not_reduced";
	readonly message: string;
}

export type ConsolidationLogicResult = Result<
	ConsolidationLogicValue,
	ConsolidationLogicError
>;

// #endregion

// #region 统一入口

/** 根据 action 执行一次独立巩固操作。 */
export function applyConsolidationCommand(
	entries: readonly string[],
	command: ConsolidationCommand,
): ConsolidationLogicResult {
	switch (command.action) {
		case "refine":
			return refineEntry(entries, command);
		case "merge":
			return mergeEntries(entries, command);
	}
}

// #endregion

// #region Refine

/** 精炼一条完整 source，最终文件字符用量不能增加。 */
function refineEntry(
	entries: readonly string[],
	command: RefineCommand,
): ConsolidationLogicResult {
	const oldEntry = command.oldEntry.trim();
	const newEntry = command.newEntry.trim();
	if (!oldEntry || !newEntry) {
		return err({
			code: "invalid_input",
			message: "refine 需要非空 oldEntry 和 newEntry",
		});
	}

	const sourceResult = findExactSource(entries, oldEntry);
	if (!sourceResult.ok) return sourceResult;

	const sourceIndex = sourceResult.value;
	const before = entries[sourceIndex]!;
	if (before === newEntry) {
		return ok({
			status: "noop",
			changed: false,
			entries,
			before: [before],
			after: newEntry,
		});
	}

	if (entries.some((entry, index) => index !== sourceIndex && entry === newEntry)) {
		return err({
			code: "duplicate_target",
			message: "refine 的 newEntry 已存在于其他 entry",
		});
	}

	if (newEntry.length > before.length) {
		return err({
			code: "not_reduced",
			message: "refine 后的 entry 不能比 source 更长",
		});
	}

	const nextEntries = [...entries];
	nextEntries[sourceIndex] = newEntry;
	return ok({
		status: "committed",
		changed: true,
		entries: nextEntries,
		before: [before],
		after: newEntry,
	});
}

// #endregion

// #region Merge

/** 合并多个完整 sources，并将结果放在最早 source 的位置。 */
function mergeEntries(
	entries: readonly string[],
	command: MergeCommand,
): ConsolidationLogicResult {
	const oldEntries = command.oldEntries.map((entry) => entry.trim());
	const newEntry = command.newEntry.trim();
	if (
		oldEntries.length < 2 ||
		oldEntries.some((entry) => !entry) ||
		!newEntry
	) {
		return err({
			code: "invalid_input",
			message: "merge 需要至少两个非空 oldEntries 和非空 newEntry",
		});
	}
	if (new Set(oldEntries).size !== oldEntries.length) {
		return err({
			code: "invalid_input",
			message: "merge 的 oldEntries 不能重复",
		});
	}

	const sourceIndices: number[] = [];
	for (const source of oldEntries) {
		const sourceResult = findExactSource(entries, source);
		if (!sourceResult.ok) return sourceResult;
		sourceIndices.push(sourceResult.value);
	}
	sourceIndices.sort((left, right) => left - right);

	const sourceIndexSet = new Set(sourceIndices);
	if (
		entries.some(
			(entry, index) => entry === newEntry && !sourceIndexSet.has(index),
		)
	) {
		return err({
			code: "duplicate_target",
			message: "merge 的 newEntry 已存在于未参与合并的 entry",
		});
	}

	const before = sourceIndices.map((index) => entries[index]!);
	const sourceContentLength = before.reduce(
		(total, entry) => total + entry.length,
		0,
	);
	if (newEntry.length >= sourceContentLength) {
		return err({
			code: "not_reduced",
			message: "merge 后的 entry 必须短于所有 sources 的内容总和",
		});
	}

	const firstSourceIndex = sourceIndices[0]!;
	const nextEntries: string[] = [];
	for (let index = 0; index < entries.length; index++) {
		if (index === firstSourceIndex) nextEntries.push(newEntry);
		if (!sourceIndexSet.has(index)) nextEntries.push(entries[index]!);
	}

	return ok({
		status: "committed",
		changed: true,
		entries: nextEntries,
		before,
		after: newEntry,
	});
}

// #endregion

// #region 精确匹配

/**
 * 使用完整字符串相等定位一个 source entry，不执行局部子串匹配。
 * 同一完整 entry 在当前 entries 中出现多次时属于 ambiguous。
 */
function findExactSource(
	entries: readonly string[],
	source: string,
): Result<number, ConsolidationLogicError> {
	let sourceIndex = -1;
	for (let index = 0; index < entries.length; index++) {
		if (entries[index] !== source) continue;
		if (sourceIndex >= 0) {
			return err({
				code: "ambiguous_match",
				message: `source entry 匹配多处："${source}"`,
			});
		}
		sourceIndex = index;
	}

	if (sourceIndex < 0) {
		return err({
			code: "not_found",
			message: `未找到 source entry："${source}"`,
		});
	}
	return ok(sourceIndex);
}

// #endregion
