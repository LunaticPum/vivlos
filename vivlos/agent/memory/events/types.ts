import { MAIN_MEMORY_REASON_CODES } from "../types.ts";
import type { MemoryFile } from "../types.ts";

// #region 协议常量

export const MEMORY_EVENT_SCHEMA_VERSION = 1 as const;

export const MEMORY_ACTORS = ["main", "consolidator", "user", "system"] as const;

export const MEMORY_ACTIONS = [
	"add",
	"replace",
	"remove",
	"duplicate",
	"reject",
	"merge",
	"noop",
] as const;

export const MEMORY_EVENT_STATUSES = ["committed", "noop", "rejected"] as const;

export const MEMORY_REASON_CODES = [
	...MAIN_MEMORY_REASON_CODES,
	"duplicate_suppression",
	"capacity_consolidation",
	"evidence_backed_enrichment",
	"security_rejection",
	"invalid_operation",
] as const;

// #endregion

// #region 协议类型

export type MemoryEventSchemaVersion = typeof MEMORY_EVENT_SCHEMA_VERSION;
export type MemoryActor = (typeof MEMORY_ACTORS)[number];
export type MemoryAction = (typeof MEMORY_ACTIONS)[number];
export type MemoryEventStatus = (typeof MEMORY_EVENT_STATUSES)[number];
export type MemoryReasonCode = (typeof MEMORY_REASON_CODES)[number];

/**
 * session 级 Memory 操作记录。
 * Event 只用于审计和巩固，不作为 Markdown 当前状态的事件溯源。
 */
export interface MemoryEvent {
	readonly schemaVersion: MemoryEventSchemaVersion;
	readonly eventId: string;
	readonly seq: number;
	readonly sessionId: string;
	readonly turnId: string;

	readonly actor: MemoryActor;
	readonly action: MemoryAction;
	readonly reasonCode: MemoryReasonCode;
	readonly reason?: string;

	readonly file: MemoryFile;
	readonly before?: string;
	readonly after?: string;

	readonly status: MemoryEventStatus;
	readonly sourceMessageIds: readonly string[];
	readonly timestamp: number;
}

// #endregion
