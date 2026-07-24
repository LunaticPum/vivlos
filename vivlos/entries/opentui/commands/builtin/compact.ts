/**
 * /compact -- 手动触发上下文压缩
 */

import type { TUICommand } from "../types.ts";

export const compactCommand: TUICommand = {
	name: "compact",
	description: "压缩上下文（手动触发）",
	execute: (ctx) => {
		ctx.compact();
	},
};
