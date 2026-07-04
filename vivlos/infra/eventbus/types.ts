/**
 * vivlos 事件类型。
 *
 * 定义策略：只包含 agent 层和 entries 层需要跨模块通信的事件。
 * 不是 pi AssistantMessageEvent 的完整重映射——那些在 agent loop 内部处理。
 * 这里只定义"跨层通信用"的公共事件。
 */
export type VivlosEvent =
	// ———— agent 生命周期 ————
	| { readonly type: "agent:start"; readonly sessionId: string }
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
			readonly type: "agent:complete";
			readonly sessionId: string;
			readonly finalMessage: string;
	  }
	| {
			readonly type: "agent:error";
			readonly sessionId: string;
			readonly error: Error;
	  }
	// ———— 文本流 ————
	| {
			readonly type: "text:delta";
			readonly sessionId: string;
			readonly delta: string;
	  }
	| {
			readonly type: "text:complete";
			readonly sessionId: string;
			readonly content: string;
	  }
	// ———— 工具调用 ————
	| {
			readonly type: "tool:call_start";
			readonly sessionId: string;
			readonly toolName: string;
			readonly callId: string;
	  }
	| {
			readonly type: "tool:call_end";
			readonly sessionId: string;
			readonly callId: string;
			readonly success: boolean;
	  }
	// ———— 通用 ————
	| {
			readonly type: "log";
			readonly level: "info" | "warn" | "error";
			readonly message: string;
	  };
