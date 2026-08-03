/** 主 Agent 的运行、消息与 Tool 生命周期事件。 */

import type { Usage } from "@earendil-works/pi-ai";

export type MainAgentEvent =
	| { readonly type: "agent:start"; readonly sessionId: string }
	| {
			readonly type: "agent:complete";
			readonly sessionId: string;
			readonly finalMessage: string;
	  }
	| {
			readonly type: "agent:turn_start";
			readonly sessionId: string;
			readonly turn: number;
	  }
	| {
			readonly type: "agent:turn_complete";
			readonly sessionId: string;
			readonly turn: number;
	  }
	| {
			readonly type: "agent:error";
			readonly sessionId: string;
			readonly kind: "error" | "aborted";
			readonly error: Error;
	  }
	| {
			readonly type: "agent:retry_start";
			readonly sessionId: string;
			readonly attempt: number;
			readonly maxAttempts: number;
			readonly delayMs: number;
			readonly error: Error;
	  }
	| {
			readonly type: "agent:retry_end";
			readonly sessionId: string;
			readonly success: boolean;
			readonly attempt: number;
			readonly finalError?: Error;
	  }
	| {
			readonly type: "agent:message_start";
			readonly sessionId: string;
			readonly role: string;
	  }
	| {
			readonly type: "agent:message_delta";
			readonly sessionId: string;
			readonly delta: string;
			readonly messageSnapshot?: unknown;
	  }
	| {
			readonly type: "agent:thinking_delta";
			readonly sessionId: string;
			readonly delta: string;
			readonly messageSnapshot?: unknown;
	  }
	| {
			readonly type: "agent:thinking_end";
			readonly sessionId: string;
			readonly content: string;
			readonly messageSnapshot?: unknown;
	  }
	| {
			readonly type: "agent:message_complete";
			readonly sessionId: string;
			readonly content: string;
			readonly thinkingContent: string;
			readonly outcome: "complete" | "error" | "aborted";
			readonly errorMessage?: string;
			readonly usage?: Usage;
	  }
	| {
			readonly type: "agent:toolCall_start";
			readonly sessionId: string;
			readonly toolName: string;
			readonly callId: string;
			readonly args: unknown;
	  }
	| {
			readonly type: "agent:toolCall_delta";
			readonly sessionId: string;
			readonly callId: string;
			readonly partialResult: any;
	  }
	| {
			readonly type: "agent:toolCall_end";
			readonly sessionId: string;
			readonly callId: string;
			readonly result: any;
			readonly success: boolean;
	  };
