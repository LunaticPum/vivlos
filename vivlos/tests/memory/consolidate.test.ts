/**
 * L1 Memory 巩固纯逻辑测试。
 *
 * 只验证单次 refine/merge 的结构和压缩语义；Security、Repository、
 * Service、Tool、模型 Runtime 与触发策略由各自领域测试负责。
 */

import { describe, expect, it } from "vitest";

import {
	applyConsolidationCommand,
	type ConsolidationLogicResult,
} from "@vivlos/agent/memory-refactor/consolidate.ts";

function expectErrorCode(
	result: ConsolidationLogicResult,
	code:
		| "invalid_input"
		| "not_found"
		| "ambiguous_match"
		| "duplicate_target"
		| "not_reduced",
): void {
	expect(result.ok).toBe(false);
	if (!result.ok) expect(result.error.code).toBe(code);
}

// #region Refine

describe("applyConsolidationCommand refine", () => {
	it.each([
		["", "new"],
		["old", ""],
		["   ", "new"],
	])("拒绝空 oldEntry/newEntry", (oldEntry, newEntry) => {
		expectErrorCode(
			applyConsolidationCommand(["old"], {
				action: "refine",
				oldEntry,
				newEntry,
			}),
			"invalid_input",
		);
	});

	it("只接受完整 entry，不接受子串 source", () => {
		expectErrorCode(
			applyConsolidationCommand(["Uses Bun."], {
				action: "refine",
				oldEntry: "Bun",
				newEntry: "Bun.",
			}),
			"not_found",
		);
	});

	it("完整 source 出现多次时返回 ambiguous_match", () => {
		expectErrorCode(
			applyConsolidationCommand(["Same", "Same"], {
				action: "refine",
				oldEntry: "Same",
				newEntry: "One",
			}),
			"ambiguous_match",
		);
	});

	it("内容不变时返回 noop 和原 entries 引用", () => {
		const entries = Object.freeze(["Keep this."]);
		const result = applyConsolidationCommand(entries, {
			action: "refine",
			oldEntry: " Keep this. ",
			newEntry: " Keep this. ",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toMatchObject({
			status: "noop",
			changed: false,
			before: ["Keep this."],
			after: "Keep this.",
		});
		expect(result.value.entries).toBe(entries);
	});

	it("newEntry 已由其他 entry 保存时拒绝", () => {
		expectErrorCode(
			applyConsolidationCommand(["Verbose", "Short"], {
				action: "refine",
				oldEntry: "Verbose",
				newEntry: "Short",
			}),
			"duplicate_target",
		);
	});

	it("newEntry 比 source 更长时拒绝", () => {
		expectErrorCode(
			applyConsolidationCommand(["Fact"], {
				action: "refine",
				oldEntry: "Fact",
				newEntry: "Longer fact",
			}),
			"not_reduced",
		);
	});

	it("允许等长精炼并在原位置写入", () => {
		const entries = Object.freeze(["head", "abc", "tail"]);
		const result = applyConsolidationCommand(entries, {
			action: "refine",
			oldEntry: "abc",
			newEntry: "xyz",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toMatchObject({
			status: "committed",
			changed: true,
			before: ["abc"],
			after: "xyz",
		});
		expect(result.value.entries).toEqual(["head", "xyz", "tail"]);
		expect(result.value.entries).not.toBe(entries);
		expect(entries).toEqual(["head", "abc", "tail"]);
	});

	it("trim 命令参数后执行缩短，不修改输入 command", () => {
		const entries = Object.freeze(["Verbose fact."]);
		const command = Object.freeze({
			action: "refine" as const,
			oldEntry: " Verbose fact. ",
			newEntry: " Fact. ",
		});
		const result = applyConsolidationCommand(entries, command);

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.entries).toEqual(["Fact."]);
		expect(command.oldEntry).toBe(" Verbose fact. ");
		expect(command.newEntry).toBe(" Fact. ");
	});
});

// #endregion

// #region Merge

describe("applyConsolidationCommand merge", () => {
	it("拒绝少于两个 sources", () => {
		expectErrorCode(
			applyConsolidationCommand(["A"], {
				action: "merge",
				oldEntries: ["A"],
				newEntry: "A",
			}),
			"invalid_input",
		);
	});

	it.each([
		[["A", ""], "A"],
		[["A", "B"], ""],
	] as const)("拒绝空 source/newEntry", (oldEntries, newEntry) => {
		expectErrorCode(
			applyConsolidationCommand(["A", "B"], {
				action: "merge",
				oldEntries,
				newEntry,
			}),
			"invalid_input",
		);
	});

	it("trim 后重复的 sources 属于 invalid_input", () => {
		expectErrorCode(
			applyConsolidationCommand(["A", "B"], {
				action: "merge",
				oldEntries: ["A", " A "],
				newEntry: "A",
			}),
			"invalid_input",
		);
	});

	it("任一 source 不存在时返回 not_found", () => {
		expectErrorCode(
			applyConsolidationCommand(["A", "B"], {
				action: "merge",
				oldEntries: ["A", "C"],
				newEntry: "AC",
			}),
			"not_found",
		);
	});

	it("任一完整 source 出现多次时返回 ambiguous_match", () => {
		expectErrorCode(
			applyConsolidationCommand(["A", "A", "B"], {
				action: "merge",
				oldEntries: ["A", "B"],
				newEntry: "AB",
			}),
			"ambiguous_match",
		);
	});

	it("newEntry 已存在于未参与 entry 时拒绝", () => {
		expectErrorCode(
			applyConsolidationCommand(["Long A", "Long B", "AB"], {
				action: "merge",
				oldEntries: ["Long A", "Long B"],
				newEntry: "AB",
			}),
			"duplicate_target",
		);
	});

	it.each(["AB", "ABC"])("newEntry 没有严格缩减时拒绝", (newEntry) => {
		expectErrorCode(
			applyConsolidationCommand(["A", "B"], {
				action: "merge",
				oldEntries: ["A", "B"],
				newEntry,
			}),
			"not_reduced",
		);
	});

	it("按当前文件顺序记录 sources，并在最早 source 位置写入", () => {
		const entries = Object.freeze([
			"head",
			"First detail",
			"middle",
			"Second detail",
			"tail",
		]);
		const oldEntries = Object.freeze(["Second detail", "First detail"]);
		const result = applyConsolidationCommand(entries, {
			action: "merge",
			oldEntries,
			newEntry: "Combined",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toMatchObject({
			status: "committed",
			changed: true,
			before: ["First detail", "Second detail"],
			after: "Combined",
		});
		expect(result.value.entries).toEqual([
			"head",
			"Combined",
			"middle",
			"tail",
		]);
		expect(result.value.entries).not.toBe(entries);
		expect(entries).toHaveLength(5);
		expect(oldEntries).toEqual(["Second detail", "First detail"]);
	});

	it("newEntry 等于一个 source 时允许压缩其他 sources", () => {
		const result = applyConsolidationCommand(["Shared", "Extra note"], {
			action: "merge",
			oldEntries: ["Shared", "Extra note"],
			newEntry: "Shared",
		});

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.entries).toEqual(["Shared"]);
	});

	it("trim 参数后合并且不修改命令输入", () => {
		const oldEntries = Object.freeze([" Long A ", " Long B "]);
		const command = Object.freeze({
			action: "merge" as const,
			oldEntries,
			newEntry: " AB ",
		});
		const result = applyConsolidationCommand(["Long A", "Long B"], command);

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.entries).toEqual(["AB"]);
		expect(command.newEntry).toBe(" AB ");
		expect(oldEntries).toEqual([" Long A ", " Long B "]);
	});
});

// #endregion
