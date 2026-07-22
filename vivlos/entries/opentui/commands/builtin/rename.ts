/**
 * /rename -- 重命名当前会话
 */

import type { TUICommand } from "../types.ts";

export const renameCommand: TUICommand = {
	name: "rename",
	description: "重命名当前会话",
	execute: (ctx, args) => {
		const name = args.trim();
		if (!name) {
			ctx.notify("请通过 /rename <name> 重命名当前会话", "warning");
			return;
		}
		ctx.renameSession(name);
		ctx.notify(`当前会话已重命名为 ${name}`, "success");
	},
};
