/**
 * /rename -- 重命名当前会话
 */

import type { TUICommand } from "../types.ts";
import { log } from "@vivlos/infra/logger/logger.ts";

export const renameCommand: TUICommand = {
	name: "rename",
	description: "重命名当前会话",
	execute: (ctx, args) => {
		const name = args.trim();
		if (!name) {
			log("warn", "请通过 /rename <name> 重命名当前会话", undefined, true);
			return;
		}
		ctx.renameSession(name);
		log("info", `当前会话已重命名为 ${name}`, undefined, true);
	},
};
