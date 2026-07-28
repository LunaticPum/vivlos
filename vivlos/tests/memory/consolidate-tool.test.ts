/**
 * Consolidate Tool 边界测试。
 *
 * 只验证模型可见 schema、参数转换、动态上下文和结果格式；Memory Logic、
 * Security、Repository 与 Event 已由各自测试覆盖，本脚本不访问文件系统或模型。
 */

import { describe, expect, it } from "vitest";

import type { ConsolidationMemoryCommand } from "@vivlos/agent/memory-refactor/consolidate.ts";
import type {
	MemoryOperationContext,
	MemoryService,
	MemoryServiceResult,
	MemoryServiceValue,
} from "@vivlos/agent/memory-refactor/service.ts";
import { createAdvancedTools } from "@vivlos/agent/tools/advanced/index.ts";
import { createConsolidateTool } from "@vivlos/agent/tools/advanced/memory/consolidate.ts";
import { createEventBus } from "@vivlos/infra/eventbus/index.ts";
import { err, ok } from "@vivlos/shared";

const CONTEXT_A: MemoryOperationContext = {
	sessionId: "session-a",
	reasonCode: "memory_consolidation",
	reason: "周期整理",
};

const CONTEXT_B: MemoryOperationContext = {
	sessionId: "session-b",
	reasonCode: "capacity_pressure",
	source: { sessionId: "session-b", historyLine: 8 },
};

interface ServiceCall {
	readonly command: ConsolidationMemoryCommand;
	readonly context: MemoryOperationContext;
}

/** 创建按顺序返回结果的无 I/O Service，并记录 Tool 的每次转发。 */
function createFakeService(results: readonly MemoryServiceResult[]): {
	readonly service: MemoryService;
	readonly calls: ServiceCall[];
} {
	const calls: ServiceCall[] = [];
	let resultIndex = 0;
	return {
		calls,
		service: {
			executeMain() {
				throw new Error("Consolidate Tool 不应调用 executeMain");
			},
			executeConsolidation(command, context) {
				calls.push({ command, context });
				const result = results[resultIndex++];
				if (!result) throw new Error("fake Service 缺少预设结果");
				return result;
			},
		},
	};
}

function committedValue(
	overrides: Partial<MemoryServiceValue> = {},
): MemoryServiceValue {
	return {
		status: "committed",
		changed: true,
		actor: "consolidator",
		action: "refine",
		file: "memory",
		before: "A complete verbose source entry.",
		after: "Complete source entry.",
		usage: { used: 24, cap: 200 },
		revisionBefore: "revision-before",
		revisionAfter: "revision-after",
		...overrides,
	} as MemoryServiceValue;
}

function noopValue(): MemoryServiceValue {
	return {
		status: "noop",
		changed: false,
		actor: "consolidator",
		action: "refine",
		file: "memory",
		before: "Keep exact entry.",
		after: "Keep exact entry.",
		usage: { used: 18, cap: 200 },
		revisionBefore: "same-revision",
		revisionAfter: "same-revision",
	};
}

function parseToolText(result: {
	readonly content: readonly { readonly type: string; readonly text?: string }[];
}): Record<string, unknown> {
	const first = result.content[0];
	if (!first || first.type !== "text" || first.text === undefined) {
		throw new Error("Tool 未返回文本内容");
	}
	return JSON.parse(first.text) as Record<string, unknown>;
}

// #region Schema 与隔离

describe("Consolidate Tool schema", () => {
	it("MEM-TOOL-001 只暴露巩固参数，且不进入主模型工具集", () => {
		const fake = createFakeService([ok(committedValue())]);
		const tool = createConsolidateTool({
			memoryService: fake.service,
			getOperationContext: () => CONTEXT_A,
		});
		const schema = tool.parameters as unknown as {
			readonly required: readonly string[];
			readonly properties: Readonly<Record<string, unknown>>;
		};

		expect(tool.name).toBe("consolidate");
		expect(Object.keys(schema.properties).sort()).toEqual([
			"action",
			"file",
			"new_entry",
			"old_entries",
			"old_entry",
		]);
		expect(schema.required).toEqual(["action", "file", "new_entry"]);
		const serializedSchema = JSON.stringify(schema);
		expect(serializedSchema).toContain('"refine"');
		expect(serializedSchema).toContain('"merge"');
		expect(serializedSchema).toContain('"memory"');
		expect(serializedSchema).toContain('"user"');
		for (const forbidden of [
			"add",
			"replace",
			"remove",
			"sessionId",
			"reasonCode",
			"reason",
			"source",
		]) {
			expect(schema.properties).not.toHaveProperty(forbidden);
		}

		const advancedTools = createAdvancedTools({
			eventBus: createEventBus(),
			getSessionId: () => "main-session",
			getSessionDir: () => "unused-session-dir",
			tasksDir: "unused-tasks-dir",
			memoryService: {} as never,
		});
		expect(advancedTools.map((advancedTool) => advancedTool.name)).not.toContain(
			"consolidate",
		);
	});
});

// #endregion

// #region 参数与上下文

describe("Consolidate Tool command mapping", () => {
	it("MEM-TOOL-002 原样映射 refine 的完整 entry", async () => {
		const fake = createFakeService([ok(committedValue())]);
		const tool = createConsolidateTool({
			memoryService: fake.service,
			getOperationContext: () => CONTEXT_A,
		});

		await tool.execute("call-refine", {
			action: "refine",
			file: "memory",
			old_entry: "  Keep source whitespace.  ",
			new_entry: " Keep whitespace. ",
		});

		expect(fake.calls).toEqual([
			{
				command: {
					action: "refine",
					file: "memory",
					oldEntry: "  Keep source whitespace.  ",
					newEntry: " Keep whitespace. ",
				},
				context: CONTEXT_A,
			},
		]);
	});

	it("MEM-TOOL-003 原样映射 merge sources 及其顺序", async () => {
		const fake = createFakeService([
			ok(
				committedValue({
					action: "merge",
					file: "user",
					before: undefined,
					beforeEntries: ["Second source.", "First source."],
				}),
			),
		]);
		const tool = createConsolidateTool({
			memoryService: fake.service,
			getOperationContext: () => CONTEXT_A,
		});

		await tool.execute("call-merge", {
			action: "merge",
			file: "user",
			old_entries: ["Second source.", "First source."],
			new_entry: "Combined source.",
		});

		expect(fake.calls[0]?.command).toEqual({
			action: "merge",
			file: "user",
			oldEntries: ["Second source.", "First source."],
			newEntry: "Combined source.",
		});
	});

	it("MEM-TOOL-004 拒绝含混参数且不读取 context 或调用 Service", async () => {
		const unsafeSource = "SECRET_SOURCE_MUST_NOT_APPEAR";
		const fake = createFakeService([]);
		let contextReads = 0;
		const tool = createConsolidateTool({
			memoryService: fake.service,
			getOperationContext: () => {
				contextReads++;
				return CONTEXT_A;
			},
		});

		const result = await tool.execute("call-invalid", {
			action: "refine",
			file: "memory",
			old_entry: unsafeSource,
			old_entries: [unsafeSource, "Other source."],
			new_entry: "Result.",
		});

		expect(parseToolText(result)).toEqual({
			status: "rejected",
			code: "invalid_tool_params",
			message: "refine 操作只接受 old_entry 参数",
		});
		expect(JSON.stringify(result)).not.toContain(unsafeSource);
		expect(contextReads).toBe(0);
		expect(fake.calls).toEqual([]);
	});

	it("MEM-TOOL-005 每次有效调用获取并转发最新 context", async () => {
		const firstResult = ok(committedValue());
		const secondResult = ok(noopValue());
		const fake = createFakeService([firstResult, secondResult]);
		const contexts = [CONTEXT_A, CONTEXT_B];
		let contextReads = 0;
		const tool = createConsolidateTool({
			memoryService: fake.service,
			getOperationContext: () => contexts[contextReads++]!,
		});

		const first = await tool.execute("call-a", {
			action: "refine",
			file: "memory",
			old_entry: "Long A.",
			new_entry: "A.",
		});
		const second = await tool.execute("call-b", {
			action: "refine",
			file: "memory",
			old_entry: "Keep exact entry.",
			new_entry: "Keep exact entry.",
		});

		expect(contextReads).toBe(2);
		expect(fake.calls.map((call) => call.context)).toEqual([
			CONTEXT_A,
			CONTEXT_B,
		]);
		expect(first.details.result).toBe(firstResult);
		expect(second.details.result).toBe(secondResult);
	});
});

// #endregion

// #region 终态结果

describe("Consolidate Tool results", () => {
	it("MEM-TOOL-006 committed 保留完整 entries、usage 和 revision", async () => {
		const beforeEntries = [
			"First complete source entry that must never be truncated.",
			"Second complete source entry that must never be truncated.",
		];
		const value = committedValue({
			action: "merge",
			before: undefined,
			beforeEntries,
			after: "Complete merged entry that must never be truncated.",
			usage: { used: 52, cap: 500 },
			revisionBefore: "full-before-revision",
			revisionAfter: "full-after-revision",
		});
		const serviceResult = ok(value);
		const fake = createFakeService([serviceResult]);
		const tool = createConsolidateTool({
			memoryService: fake.service,
			getOperationContext: () => CONTEXT_A,
		});

		const result = await tool.execute("call-committed", {
			action: "merge",
			file: "memory",
			old_entries: beforeEntries,
			new_entry: value.after!,
		});

		expect(parseToolText(result)).toEqual(value);
		expect(result.details.result).toBe(serviceResult);
		expect(result.details.message).toContain("已合并 memory.md 的 2 条记忆");
	});

	it("MEM-TOOL-006 noop 保留完整终态且不伪装 committed", async () => {
		const value = noopValue();
		const serviceResult = ok(value);
		const fake = createFakeService([serviceResult]);
		const tool = createConsolidateTool({
			memoryService: fake.service,
			getOperationContext: () => CONTEXT_A,
		});

		const result = await tool.execute("call-noop", {
			action: "refine",
			file: "memory",
			old_entry: "Keep exact entry.",
			new_entry: "Keep exact entry.",
		});

		expect(parseToolText(result)).toEqual(value);
		expect(result.details.result).toBe(serviceResult);
		expect(result.details.message).toBe("memory.md 内容未变化（18/200 字符）");
	});

	it("MEM-TOOL-007 rejected 只返回 Service 的脱敏错误", async () => {
		const unsafeSource = "UNSAFE_CANDIDATE_MUST_NOT_LEAK";
		const serviceResult: MemoryServiceResult = err({
			code: "prompt_injection",
			message: "Memory 内容包含试图覆盖已有指令的表达",
			actor: "consolidator",
			action: "refine",
			file: "memory",
			usage: { used: 40, cap: 200 },
			revisionBefore: "safe-revision",
			revisionAfter: "safe-revision",
			violations: [
				{
					code: "prompt_injection",
					message: "Memory 内容包含试图覆盖已有指令的表达",
				},
			],
		});
		const fake = createFakeService([serviceResult]);
		const tool = createConsolidateTool({
			memoryService: fake.service,
			getOperationContext: () => CONTEXT_A,
		});

		const result = await tool.execute("call-rejected", {
			action: "refine",
			file: "memory",
			old_entry: "Safe old entry.",
			new_entry: unsafeSource,
		});
		const payload = parseToolText(result);

		expect(payload).toMatchObject({
			status: "rejected",
			code: "prompt_injection",
			revisionBefore: "safe-revision",
			revisionAfter: "safe-revision",
		});
		expect(JSON.stringify(result)).not.toContain(unsafeSource);
		expect(result.details.result).toBe(serviceResult);
	});

	it("MEM-TOOL-008 连续终态不缓存前次 command 或结果", async () => {
		const firstResult = ok(committedValue());
		const rejectedResult: MemoryServiceResult = err({
			code: "not_found",
			message: "未找到 source entry",
			actor: "consolidator",
			action: "merge",
			file: "user",
			usage: { used: 9, cap: 100 },
			revisionBefore: "second-revision",
			revisionAfter: "second-revision",
		});
		const fake = createFakeService([firstResult, rejectedResult]);
		const tool = createConsolidateTool({
			memoryService: fake.service,
			getOperationContext: () => CONTEXT_A,
		});

		const first = await tool.execute("call-first", {
			action: "refine",
			file: "memory",
			old_entry: "Long first.",
			new_entry: "First.",
		});
		const second = await tool.execute("call-second", {
			action: "merge",
			file: "user",
			old_entries: ["User A.", "User B."],
			new_entry: "User AB.",
		});

		expect(parseToolText(first)).toEqual(committedValue());
		expect(parseToolText(second)).toMatchObject({
			status: "rejected",
			action: "merge",
			file: "user",
			revisionBefore: "second-revision",
		});
		expect(fake.calls[1]?.command).toEqual({
			action: "merge",
			file: "user",
			oldEntries: ["User A.", "User B."],
			newEntry: "User AB.",
		});
	});
});

// #endregion
