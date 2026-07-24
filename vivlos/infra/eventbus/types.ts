/**
 * vivlos 事件类型。
 */
import type { Usage } from "@earendil-works/pi-ai";

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
			readonly usage?: Usage;
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
			/** true 时通知同时在 TUI StatusBar 显示（默认 false，仅日志持久化） */
			readonly onTui?: boolean;
	  }
	// ———— 上下文压缩 ————
	| {
			readonly type: "compaction:started";
			readonly sessionId: string;
	  }
	| {
			readonly type: "compaction:ended";
			readonly sessionId: string;
			/** 压缩结果：true = 实际压缩了消息，false = noOp（无可压缩内容） */
			readonly compressed: boolean;
			/** 被压缩的消息数量（noOp 时为 0） */
			readonly compactedCount: number;
	  }
	// ———— todo（session 级短期任务） ————
	| {
			readonly type: "todo:updated";
			readonly sessionId: string;
			readonly todos: TodoItem[];
	  }
	// ———— task（跨 session 长期目标） ————
	| {
			readonly type: "task:created";
			readonly listName: string;
			readonly task: TaskItem;
	  }
	| {
			readonly type: "task:updated";
			readonly listName: string;
			readonly task: TaskItem;
	  }
	| {
			readonly type: "task:completed";
			readonly listName: string;
			readonly taskId: string;
	  }
	// ———— offer_choice（TUI 交互选择） ————
	| {
			readonly type: "offer_choice:pending";
			readonly resolveId: string;
			readonly prompt: string;
			readonly choices: readonly string[];
			readonly multiple: boolean;
	  }
	| {
			readonly type: "offer_choice:resolved";
			readonly resolveId: string;
			readonly selection: string | readonly string[];
	  };

// #region 共享类型（事件 + tool + SideBar 共用）

/** todo 条目 */
export interface TodoItem {
	readonly content: string;
	readonly status: "pending" | "in_progress" | "completed" | "cancelled";
	readonly priority?: "high" | "medium" | "low";
}

/** task 条目（长期目标） */
export interface TaskItem {
	readonly id: string;
	readonly title: string;
	readonly description?: string;
	readonly status: "pending" | "in_progress" | "completed";
	readonly createdAt: number;
	readonly completedAt?: number;
}

// #endregion