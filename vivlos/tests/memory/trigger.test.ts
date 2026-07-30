/**
 * Memory 巩固 Trigger 纯函数测试。
 *
 * 只验证触发条件、优先级、输出和输入不变性，不读取文件、不保存 cursor，
 * 也不启动 Runtime、模型或 Tool。
 */

import { describe, expect, it } from "vitest";

import {
	checkTrigger,
	type TriggerInput,
} from "@vivlos/agent/memory/consolidator/trigger.ts";
import type {
	HistoryItem,
	HistoryRead,
	MemoryStorageSnapshot,
} from "@vivlos/infra/storage/memory/index.ts";

function snapshot(
	overrides: Partial<MemoryStorageSnapshot> = {},
): MemoryStorageSnapshot {
	return {
		entries: { memory: ["Stored fact."], user: [] },
		usage: {
			memory: { used: 20, cap: 100 },
			user: { used: 0, cap: 100 },
		},
		revision: "revision",
		...overrides,
	};
}

function record(
	line: number,
	outcome: HistoryItem["outcome"] = "committed",
): HistoryItem {
	return {
		line,
		action: "add",
		outcome,
		file: "memory",
		reasonCode: "explicit_user_request",
		after: "Stored fact.",
		timestamp: line,
	};
}

function history(
	records: readonly HistoryItem[] = [],
	tail = records.at(-1)?.line ?? 0,
): HistoryRead {
	return { records, issues: [], tail };
}

function input(overrides: Partial<TriggerInput> = {}): TriggerInput {
	return {
		snapshot: snapshot(),
		history: history(),
		cursor: 0,
		...overrides,
	};
}

// #region 基础触发

describe("Memory Trigger signals", () => {
	it("MEM-TRG-001 空 L1 对所有信号都返回 null", () => {
		const empty = snapshot({
			entries: { memory: [], user: [] },
			usage: {
				memory: { used: 100, cap: 100 },
				user: { used: 100, cap: 100 },
			},
		});
		const records = Array.from({ length: 20 }, (_, index) => record(index + 1));

		expect(
			checkTrigger({
				snapshot: empty,
				history: history(records),
				cursor: 0,
				requested: true,
			}),
		).toBeNull();
	});

	it("MEM-TRG-002 显式请求无需新历史且优先返回 main_request", () => {
		const result = checkTrigger(input({ cursor: 4, history: history([], 4), requested: true }));

		expect(result).toMatchObject({
			reason: "main_request",
			cursor: 4,
			tail: 4,
			files: [],
		});
	});

	it("MEM-TRG-003 容量边界只报告有 entry 的受压文件", () => {
		const records = [record(1)];
		const pressured = snapshot({
			entries: { memory: ["M"], user: ["U"] },
			usage: {
				memory: { used: 85, cap: 100 },
				user: { used: 90, cap: 100 },
			},
		});
		const decision = checkTrigger({
			snapshot: pressured,
			history: history(records),
			cursor: 0,
		});

		expect(decision).toMatchObject({
			reason: "capacity_pressure",
			files: ["memory", "user"],
		});
		expect(
			checkTrigger({
				snapshot: pressured,
				history: history([], 0),
				cursor: 0,
			}),
		).toBeNull();
		expect(
			checkTrigger({
				snapshot: snapshot({
					entries: { memory: ["M"], user: [] },
					usage: {
						memory: { used: 84, cap: 100 },
						user: { used: 100, cap: 100 },
					},
				}),
				history: history(records),
				cursor: 0,
			}),
		).toBeNull();
	});

	it("MEM-TRG-004 只统计 committed，并支持自定义操作阈值", () => {
		const nineteen = Array.from({ length: 19 }, (_, index) => record(index + 1));
		expect(checkTrigger(input({ history: history(nineteen) }))).toBeNull();

		const twenty = [...nineteen, record(20)];
		expect(checkTrigger(input({ history: history(twenty) }))).toMatchObject({
			reason: "operation_threshold",
		});

		const mixed = [record(1), record(2, "noop"), record(3, "rejected")];
		expect(
			checkTrigger(
				input({ history: history(mixed), config: { operationLimit: 2 } }),
			),
		).toBeNull();
		expect(
			checkTrigger(
				input({ history: history(mixed), config: { operationLimit: 1 } }),
			),
		).toMatchObject({ reason: "operation_threshold" });
	});

	it("MEM-TRG-005 固定请求、容量、操作数量的优先级", () => {
		const records = [record(1), record(2)];
		const pressured = snapshot({
			usage: {
				memory: { used: 90, cap: 100 },
				user: { used: 0, cap: 100 },
			},
		});
		const common = {
			snapshot: pressured,
			history: history(records),
			cursor: 0,
			config: { operationLimit: 1 },
		};

		expect(checkTrigger({ ...common, requested: true })?.reason).toBe("main_request");
		expect(checkTrigger(common)?.reason).toBe("capacity_pressure");
	});
});

// #endregion

// #region 输出与安全约束

describe("Memory Trigger contract", () => {
	it("MEM-TRG-006 返回完整 decision 且不补充 History 内容", () => {
		const records = [record(3)];
		const current = snapshot();
		const currentHistory = history(records, 5);
		const result = checkTrigger({
			snapshot: current,
			history: currentHistory,
			cursor: 2,
			requested: true,
		});

		expect(result).toEqual({
			reason: "main_request",
			cursor: 2,
			tail: 5,
			records,
			usage: current.usage,
			files: [],
		});
		expect(result?.records).toBe(currentHistory.records);
		expect(result?.usage).toBe(current.usage);
	});

	it("MEM-TRG-007 拒绝非法配置、cursor 和 record 行区间", () => {
		expect(() => checkTrigger(input({ config: { operationLimit: 0 } }))).toThrow(
			"operationLimit",
		);
		expect(() => checkTrigger(input({ config: { capacityRatio: 0 } }))).toThrow(
			"capacityRatio",
		);
		expect(() => checkTrigger(input({ config: { capacityRatio: 1.1 } }))).toThrow(
			"capacityRatio",
		);
		expect(() => checkTrigger(input({ cursor: -1 }))).toThrow("cursor");
		expect(() => checkTrigger(input({ cursor: 2, history: history([], 1) }))).toThrow(
			"cursor 不能超过",
		);
		expect(() =>
			checkTrigger(
				input({
					cursor: 1,
					history: history([record(1)], 2),
				}),
			),
		).toThrow("按行递增");
		expect(() =>
			checkTrigger(
				input({
					history: history([record(2), record(1)], 2),
				}),
			),
		).toThrow("按行递增");
	});

	it("MEM-TRG-008 重复判定保持纯函数和无状态", () => {
		const records = Object.freeze([record(1)]);
		const current = Object.freeze(snapshot());
		const currentHistory = Object.freeze(history(records));
		const config = Object.freeze({ operationLimit: 1, capacityRatio: 0.85 });
		const value = Object.freeze({
			snapshot: current,
			history: currentHistory,
			cursor: 0,
			config,
		});
		const before = JSON.stringify(value);

		const first = checkTrigger(value);
		const second = checkTrigger(value);

		expect(first).toEqual(second);
		expect(first?.reason).toBe("operation_threshold");
		expect(JSON.stringify(value)).toBe(before);
		expect(records).toEqual([record(1)]);
	});
});

// #endregion
