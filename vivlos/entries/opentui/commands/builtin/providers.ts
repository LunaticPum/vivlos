/**
 * /providers -- 打开供应商选择弹窗
 *
 * 快捷键: Ctrl+P
 * 切换 provider 后自动跳转到模型选择弹窗。
 */

import type { TUICommand } from "../types.ts";

export const providersCommand: TUICommand = {
	name: "providers",
	description: "切换供应商",
	shortcut: "Ctrl+P",
	execute: (ctx) => {
		ctx.openProviders();
	},
};
