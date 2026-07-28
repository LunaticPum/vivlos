/** 应用日志与上下文压缩事件。 */

export type AppEvent =
	| {
			readonly type: "log";
			readonly level: "info" | "warn" | "error";
			readonly message: string;
			readonly error?: Error;
			/** true 时通知同时在 TUI StatusBar 显示（默认 false，仅日志持久化） */
			readonly onTui?: boolean;
	  }
	| {
			readonly type: "compaction:started";
			readonly sessionId: string;
	  }
	| {
			readonly type: "compaction:ended";
			readonly sessionId: string;
			/** true 表示实际压缩，false 表示无可压缩内容。 */
			readonly compressed: boolean;
			readonly compactedCount: number;
	  };
