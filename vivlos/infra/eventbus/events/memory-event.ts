/** Session L1 Memory 的操作终态与内容变化事件。 */

import type { MemoryOverview } from "@vivlos/infra/storage/memory/index.ts";

export interface MemoryOperationEvent {
	readonly type: "memory:operation";
	readonly eventId: string;
	readonly timestamp: number;
	readonly sessionId: string;
	readonly actor: "main" | "consolidator";
	readonly action: "add" | "replace" | "remove" | "merge" | "refine";
	readonly outcome: "committed" | "noop" | "rejected";
	readonly file: "memory" | "user";
	readonly reasonCode: string;
	readonly reason?: string;
	readonly before?: string;
	readonly beforeEntries?: readonly string[];
	readonly after?: string;
	readonly revisionBefore: string;
	readonly revisionAfter: string;
	readonly source?: {
		readonly sessionId: string;
		readonly historyLine: number;
	};
	readonly errorCode?: string;
	readonly errorMessage?: string;
}

export interface MemoryChangedEvent {
	readonly type: "memory:changed";
	readonly sessionId: string;
	readonly file: "memory" | "user";
	readonly revisionBefore: string;
	readonly revisionAfter: string;
}

export interface MemoryOverviewRequestedEvent {
	readonly type: "memory:overview_requested";
	readonly sessionId: string;
}

export interface MemoryOverviewEvent {
	readonly type: "memory:overview";
	readonly overview: MemoryOverview;
}

export type MemoryEvent =
	| MemoryOperationEvent
	| MemoryChangedEvent
	| MemoryOverviewRequestedEvent
	| MemoryOverviewEvent;
