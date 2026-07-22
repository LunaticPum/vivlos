/**
 * /sessions -- 打开会话弹窗，或用 sessionId 快捷切换
 */

import type { TUICommand } from "../types.ts";

export const sessionsCommand: TUICommand = {
	name: "sessions",
	description: "会话管理",
	execute: (ctx, args) => {
		const id = args.trim();
		if (id) {
			ctx.switchToSession(id);
		} else {
			ctx.openSessions();
		}
	},
};
