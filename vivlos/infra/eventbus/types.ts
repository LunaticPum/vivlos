/**
 * vivlos 事件类型。
 */
export type VivlosEvent =
	// ———— agent 生命周期 ————
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
			readonly error: Error;
	  }
	// ———— 消息生命周期 ————
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
	  }
	// ———— 工具调用生命周期 ————
	| {
			readonly type: "agent:toolCall_start";
			readonly sessionId: string;
			readonly toolName: string;
			readonly callId: string;
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
	  }
	// ———— 通用 ————
	| {
			readonly type: "log";
			readonly level: "info" | "warn" | "error";
			readonly message: string;
			readonly error?: Error;
	  };