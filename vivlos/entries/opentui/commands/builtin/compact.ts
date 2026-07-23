/**
 * /compact -- 手动触发上下文压缩
 */

import type { TUICommand } from "../types.ts";

export const compactCommand: TUICommand = {
	name: "compact",
	description: "压缩上下文（手动触发）",
	execute: (ctx) => {
		ctx.notify("正在压缩上下文...", "#f9e2af");
		ctx.compact()
			.then(() => ctx.notify("上下文压缩完成", "#a6e3a1"))
			.catch((err) =>
				ctx.notify(
					`压缩失败: ${err instanceof Error ? err.message : String(err)}`,
					"#f38ba8",
				),
			);
	},
};
