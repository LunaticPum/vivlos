/**
 * /new -- 新建会话
 */

import type { TUICommand } from "../types.ts";

export const newCommand: TUICommand = {
	name: "new",
	description: "新建会话",
	execute: (ctx) => {
		ctx.newSession();
	},
};
