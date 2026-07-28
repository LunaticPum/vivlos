/** Consolidator 的运行与 Tool 生命周期事件。 */

export type ConsolidateReason =
	| "main_request"
	| "capacity_pressure"
	| "operation_threshold";

export type ConsolidateStatus = "completed" | "failed" | "aborted";

export interface ConsolidateError {
	readonly code: string;
	readonly message: string;
}

export type ConsolidateEvent =
	| {
			readonly type: "consolidate:started";
			readonly sessionId: string;
			readonly reason: ConsolidateReason;
	  }
	| {
			readonly type: "consolidate:tool_started";
			readonly sessionId: string;
			readonly toolName: string;
			readonly callId: string;
			readonly args: unknown;
	  }
	| {
			readonly type: "consolidate:tool_completed";
			readonly sessionId: string;
			readonly toolName: string;
			readonly callId: string;
			readonly result: unknown;
			readonly success: boolean;
	  }
	| {
			readonly type: "consolidate:ended";
			readonly sessionId: string;
			readonly reason: ConsolidateReason;
			readonly status: ConsolidateStatus;
			readonly toolCalls: number;
			readonly cursorBefore: number;
			readonly cursorAfter: number;
			readonly error?: ConsolidateError;
	  };
