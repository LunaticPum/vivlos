/**
 * /models -- 打开模型选择弹窗
 *
 * 快捷键: Ctrl+L
 * 仅显示当前 provider 下的模型列表。
 */

import type { TUICommand } from "../types.ts";

export const modelsCommand: TUICommand = {
	name: "models",
	description: "切换模型",
	shortcut: "Ctrl+L",
	execute: (ctx) => {
		ctx.openModels();
	},
};
