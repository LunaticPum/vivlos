/**
 * /models -- 打开模型选择弹窗
 *
 * 快捷键: Ctrl+L
 * 仅显示当前 provider 下的模型列表。
 */

import type { TUICommand } from "../types.ts";
import { KEYBINDS, formatKeybind } from "../../keybinds";

export const modelsCommand: TUICommand = {
	name: "models",
	description: KEYBINDS.openModels.description,
	shortcut: formatKeybind(KEYBINDS.openModels),
	execute: (ctx) => {
		ctx.openModels();
	},
};
