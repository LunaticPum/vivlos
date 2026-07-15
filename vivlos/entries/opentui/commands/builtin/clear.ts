/**
 * /clear -- 清空当前会话
 */

import type { TUICommand } from "../types.ts";

export const clearCommand: TUICommand = {
	name: "clear",
	description: "清空当前会话",
	execute: (ctx) => {
		ctx.clearConversation();
	},
};
