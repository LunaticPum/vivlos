/**
 * L1 Memory 低频巩固触发判定。
 *
 * 本脚本是纯函数：不读取文件、不推进 cursor、不调用模型或 Tool，也不保存运行状态。
 */

import type {
	HistoryItem,
	HistoryRead,
	MemoryFile,
	MemoryStorageSnapshot,
} from "@vivlos/infra/storage/memory/index.ts";

// #region 触发契约

export const DEFAULT_TRIGGER_CONFIG = {
	operationLimit: 20,
	capacityRatio: 0.85,
} as const;

export interface TriggerConfig {
	readonly operationLimit: number;
	readonly capacityRatio: number;
}

export interface TriggerInput {
	readonly snapshot: MemoryStorageSnapshot;
	readonly history: HistoryRead;
	readonly cursor: number;
	readonly requested?: boolean;
	readonly config?: Partial<TriggerConfig>;
}

export type TriggerReason =
	| "main_request"
	| "capacity_pressure"
	| "operation_threshold";

/** cursor 为审视前位置，tail 为本次决定覆盖到的日志尾行。 */
export interface TriggerDecision {
	readonly reason: TriggerReason;
	readonly cursor: number;
	readonly tail: number;
	readonly records: readonly HistoryItem[];
	readonly usage: MemoryStorageSnapshot["usage"];
	readonly files: readonly MemoryFile[];
}

// #endregion

// #region 触发判定

/** 按主模型请求、容量压力、操作数量的优先级计算一次触发决定。 */
export function checkTrigger(input: TriggerInput): TriggerDecision | null {
	const config = resolveConfig(input.config);
	validateInput(input);

	if (
		input.snapshot.entries.memory.length === 0 &&
		input.snapshot.entries.user.length === 0
	) {
		return null;
	}

	const base = {
		cursor: input.cursor,
		tail: input.history.tail,
		records: input.history.records,
		usage: input.snapshot.usage,
	};
	if (input.requested) {
		return { ...base, reason: "main_request", files: [] };
	}

	const hasNewRecords = input.history.records.length > 0;
	const files = hasNewRecords
		? pressuredFiles(input.snapshot, config.capacityRatio)
		: [];
	if (files.length > 0) {
		return { ...base, reason: "capacity_pressure", files };
	}

	const committed = input.history.records.filter(
		(record) => record.outcome === "committed",
	).length;
	if (committed >= config.operationLimit) {
		return { ...base, reason: "operation_threshold", files: [] };
	}

	return null;
}

// #endregion

// #region 校验与辅助

function resolveConfig(config?: Partial<TriggerConfig>): TriggerConfig {
	const value = { ...DEFAULT_TRIGGER_CONFIG, ...config };
	if (!Number.isSafeInteger(value.operationLimit) || value.operationLimit < 1) {
		throw new Error("operationLimit 必须是正安全整数");
	}
	if (
		!Number.isFinite(value.capacityRatio) ||
		value.capacityRatio <= 0 ||
		value.capacityRatio > 1
	) {
		throw new Error("capacityRatio 必须在 (0, 1] 范围内");
	}
	return value;
}

function validateInput(input: TriggerInput): void {
	if (!Number.isSafeInteger(input.cursor) || input.cursor < 0) {
		throw new Error("cursor 必须是非负安全整数");
	}
	if (input.cursor > input.history.tail) {
		throw new Error("cursor 不能超过 history tail");
	}

	let lastLine = input.cursor;
	for (const record of input.history.records) {
		if (record.line <= lastLine || record.line > input.history.tail) {
			throw new Error("history records 必须位于 cursor 与 tail 之间并按行递增");
		}
		lastLine = record.line;
	}
}

function pressuredFiles(
	snapshot: MemoryStorageSnapshot,
	ratio: number,
): MemoryFile[] {
	const files: MemoryFile[] = [];
	for (const file of ["memory", "user"] as const) {
		const usage = snapshot.usage[file];
		if (
			snapshot.entries[file].length > 0 &&
			usage.cap > 0 &&
			usage.used / usage.cap >= ratio
		) {
			files.push(file);
		}
	}
	return files;
}

// #endregion
