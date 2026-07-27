import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const MEMORY_CONSOLIDATION_BATCH_SIZE = 20 as const;

export type MemoryConsolidationStatus = "idle" | "running" | "failed";

export interface MemoryConsolidationState {
	readonly processedThrough: number;
	readonly lastConsolidationId?: string;
	readonly status: MemoryConsolidationStatus;
}

export interface ConsolidationCheckpoint {
	read(): MemoryConsolidationState;
	save(state: MemoryConsolidationState): MemoryConsolidationState;
}

const INITIAL_STATE: MemoryConsolidationState = Object.freeze({
	processedThrough: 0,
	status: "idle",
});

// #region Checkpoint 主入口

/** 创建绑定到单个 session 的巩固状态仓储。 */
export function createConsolidationCheckpoint(
	sessionDir: string,
): ConsolidationCheckpoint {
	const filePath = resolve(sessionDir, "memory-consolidation.json");

	const read = (): MemoryConsolidationState => readState(filePath);
	return {
		read,
		save(state) {
			validateState(state);
			const current = read();
			if (state.processedThrough < current.processedThrough) {
				throw new Error(
					`processedThrough 不能回退：current=${current.processedThrough}, next=${state.processedThrough}`,
				);
			}

			const normalized = normalizeState(state);
			mkdirSync(dirname(filePath), { recursive: true });
			writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
			return normalized;
		},
	};
}

// #endregion

// #region 状态读取与校验

function readState(filePath: string): MemoryConsolidationState {
	if (!existsSync(filePath)) return INITIAL_STATE;
	let state: unknown;
	try {
		state = JSON.parse(readFileSync(filePath, "utf-8"));
	} catch {
		throw new Error("memory-consolidation.json 不是有效 JSON");
	}
	validateState(state);
	return normalizeState(state);
}

function validateState(state: unknown): asserts state is MemoryConsolidationState {
	if (!state || typeof state !== "object" || Array.isArray(state)) {
		throw new Error("MemoryConsolidationState 必须是对象");
	}
	const value = state as Record<string, unknown>;
	if (
		!Number.isSafeInteger(value.processedThrough) ||
		(value.processedThrough as number) < 0
	) {
		throw new Error("processedThrough 必须是非负安全整数");
	}
	if (value.status !== "idle" && value.status !== "running" && value.status !== "failed") {
		throw new Error("MemoryConsolidationState status 无效");
	}
	if (
		value.lastConsolidationId !== undefined &&
		(typeof value.lastConsolidationId !== "string" || !value.lastConsolidationId.trim())
	) {
		throw new Error("lastConsolidationId 必须是非空字符串");
	}
	if (value.status === "running" && value.lastConsolidationId === undefined) {
		throw new Error("running 状态需要 lastConsolidationId");
	}

	const allowedKeys = new Set(["processedThrough", "lastConsolidationId", "status"]);
	for (const key of Object.keys(value)) {
		if (!allowedKeys.has(key)) throw new Error(`MemoryConsolidationState 包含未知字段：${key}`);
	}
}

function normalizeState(state: MemoryConsolidationState): MemoryConsolidationState {
	return {
		processedThrough: state.processedThrough,
		...(state.lastConsolidationId
			? { lastConsolidationId: state.lastConsolidationId.trim() }
			: {}),
		status: state.status,
	};
}

// #endregion
