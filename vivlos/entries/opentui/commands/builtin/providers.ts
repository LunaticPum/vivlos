/**
 * /providers -- 打开供应商选择弹窗
 *
 * 快捷键: Ctrl+P
 * 切换 provider 后自动跳转到模型选择弹窗。
 */

import type { TUICommand } from "../types.ts";
import { KEYBINDS, formatKeybind } from "../../keybinds";

export const providersCommand: TUICommand = {
	name: "providers",
	description: KEYBINDS.openProviders.description,
	shortcut: formatKeybind(KEYBINDS.openProviders),
	execute: (ctx) => {
		ctx.openProviders();
	},
};
