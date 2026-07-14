/**
 * /help -- 打开指令帮助弹窗
 *
 * 快捷键: Ctrl+O
 * 弹窗内列出所有已注册指令及对应快捷键。
 */

import type { TUICommand } from "../types.ts";
import { KEYBINDS, formatKeybind } from "../../keybinds.ts";

export const helpCommand: TUICommand = {
	name: "help",
	description: KEYBINDS.openHelp.description,
	shortcut: formatKeybind(KEYBINDS.openHelp),
	execute: (ctx) => {
		ctx.showHelp();
	},
};
