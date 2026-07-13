/**
 * /help -- 打开指令帮助弹窗
 *
 * 快捷键: Ctrl+H
 * 弹窗内列出所有已注册指令及对应快捷键。
 */

import type { TUICommand } from "../types.ts";

export const helpCommand: TUICommand = {
	name: "help",
	description: "显示所有指令",
	shortcut: "Ctrl+O",
	execute: (ctx) => {
		ctx.showHelp();
	},
};
