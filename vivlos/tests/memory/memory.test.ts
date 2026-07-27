/**
 * 主动记忆 Logic 测试。
 *
 * 验证 add/replace/remove 的纯内存语义、唯一子串规则和不可变性。
 * Repository、Security、Service、Event 与字符上限由各自测试负责。
 */

import { describe, expect, it } from "vitest";

import {
	addEntry,
	removeEntry,
	replaceEntry,
} from "@vivlos/agent/memory-refactor/memory.ts";

// #region Add

describe("addEntry", () => {
	it("拒绝空内容", () => {
		const result = addEntry([], "   ");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid_input");
	});

	it("trim 内容并在末尾追加，不修改输入 entries", () => {
		const entries = Object.freeze(["first"]);
		const result = addEntry(entries, " second ");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toMatchObject({
			status: "committed",
			changed: true,
			after: "second",
		});
		expect(result.value.entries).toEqual(["first", "second"]);
		expect(result.value.entries).not.toBe(entries);
		expect(entries).toEqual(["first"]);
	});

	it("精确重复返回 noop 和原 entries 引用", () => {
		const entries = Object.freeze(["first"]);
		const result = addEntry(entries, " first ");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toMatchObject({
			status: "noop",
			changed: false,
			before: "first",
			after: "first",
		});
		expect(result.value.entries).toBe(entries);
	});
});

// #endregion

// #region Replace

describe("replaceEntry", () => {
	it.each([
		["", "new"],
		["old", ""],
		["   ", "new"],
	])("拒绝空 oldText/newText", (oldText, newText) => {
		const result = replaceEntry(["entry"], oldText, newText);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid_input");
	});

	it("没有匹配时返回 not_found", () => {
		const result = replaceEntry(["Uses Bun."], "Node", "Bun");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("not_found");
	});

	it.each([
		[["Uses Bun.", "Bun manages packages."], "Bun"],
		[["Bun and Bun"], "Bun"],
		[["aaa"], "aa"],
	] as const)("多处和重叠匹配返回 ambiguous_match", (entries, oldText) => {
		const result = replaceEntry(entries, oldText, "replacement");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("ambiguous_match");
	});

	it("替换唯一子串并返回完整 before/after", () => {
		const entries = Object.freeze(["Uses Bun runtime.", "Keep this."]);
		const result = replaceEntry(entries, "runtime", "runtime and package manager");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toMatchObject({
			status: "committed",
			changed: true,
			before: "Uses Bun runtime.",
			after: "Uses Bun runtime and package manager.",
		});
		expect(result.value.entries).toEqual([
			"Uses Bun runtime and package manager.",
			"Keep this.",
		]);
		expect(result.value.entries).not.toBe(entries);
		expect(entries).toEqual(["Uses Bun runtime.", "Keep this."]);
	});

	it("最终内容不变时返回 noop 和原 entries 引用", () => {
		const entries = Object.freeze(["Uses Bun."]);
		const result = replaceEntry(entries, "Bun", "Bun");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.status).toBe("noop");
		expect(result.value.changed).toBe(false);
		expect(result.value.entries).toBe(entries);
	});

	it("目标与其他 entry 重复时删除旧 entry 并保留已有目标", () => {
		const entries = Object.freeze(["Uses Node.", "Keep this.", "Uses Bun."]);
		const result = replaceEntry(entries, "Node", "Bun");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.status).toBe("committed");
		expect(result.value.before).toBe("Uses Node.");
		expect(result.value.after).toBe("Uses Bun.");
		expect(result.value.entries).toEqual(["Keep this.", "Uses Bun."]);
		expect(entries).toHaveLength(3);
	});
});

// #endregion

// #region Remove

describe("removeEntry", () => {
	it("拒绝空 oldText", () => {
		const result = removeEntry(["entry"], "   ");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid_input");
	});

	it("没有匹配时返回 not_found", () => {
		const result = removeEntry(["Uses Bun."], "Node");
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("not_found");
	});

	it.each([
		[["Uses Bun.", "Bun manages packages."], "Bun"],
		[["Bun and Bun"], "Bun"],
		[["aaa"], "aa"],
	] as const)("多处和重叠匹配返回 ambiguous_match", (entries, oldText) => {
		const result = removeEntry(entries, oldText);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("ambiguous_match");
	});

	it("唯一命中时删除完整 entry，不修改输入 entries", () => {
		const entries = Object.freeze(["Uses Bun runtime.", "Keep this."]);
		const result = removeEntry(entries, "runtime");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toMatchObject({
			status: "committed",
			changed: true,
			before: "Uses Bun runtime.",
		});
		expect(result.value.after).toBeUndefined();
		expect(result.value.entries).toEqual(["Keep this."]);
		expect(result.value.entries).not.toBe(entries);
		expect(entries).toHaveLength(2);
	});

	it("删除最后一条后返回空数组", () => {
		const result = removeEntry(["only entry"], "only");
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.entries).toEqual([]);
	});
});

// #endregion
