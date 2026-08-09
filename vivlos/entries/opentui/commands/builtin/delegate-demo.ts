/**
 * /delegate-demo -- 模拟委派全流程（样式原型）
 *
 * 走真实事件管道驱动委派卡片与侧边栏 Task 条目，
 * 用于确定设计样式后再与真实 delegate tool 对接。
 */

import type { TUICommand } from "../types.ts";

export const delegateDemoCommand: TUICommand = {
	name: "delegate-demo",
	description: "模拟委派全流程（样式原型）",
	execute: (ctx) => {
		ctx.runDelegateDemo();
	},
};
