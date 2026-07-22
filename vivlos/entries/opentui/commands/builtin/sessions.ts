/**
 * /sessions -- 打开会话管理弹窗
 */

import type { TUICommand } from "../types.ts";

export const sessionsCommand: TUICommand = {
	name: "sessions",
	description: "会话管理",
	execute: (ctx) => {
		ctx.openSessions();
	},
};
