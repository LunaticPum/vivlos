/**
 * /detail -- 展开/折叠推理细节
 *
 * 仅在有已完成的对话时生效。
 */

import type { TUICommand } from "../types.ts";

export const detailCommand: TUICommand = {
	name: "detail",
	description: "展开/折叠推理细节",
	execute: (ctx) => {
		ctx.toggleDetail();
	},
};
