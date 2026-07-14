/**
 * 快捷键统一管理
 *
 * 所有 Ctrl+键 快捷键集中定义在此文件。
 * 新增快捷键时：
 * 1. 在 KEYBINDS 中添加定义
 * 2. 参照 commands/注意.md 确认键不被终端特殊处理
 * 3. 用 matchesKeybind() 匹配
 */

import type { KeyEvent } from "@opentui/core";

/** 快捷键定义 */
export interface Keybind {
	/** 按键名（如 "l", "p", "o"） */
	name: string;
	/** 是否需要 Ctrl */
	ctrl?: boolean;
	/** 是否需要 Alt/Meta */
	meta?: boolean;
	/** 描述，用于帮助弹窗 */
	description: string;
}

/** 已注册的快捷键 */
export const KEYBINDS = {
	/** 模型选择弹窗 */
	openModels: { ctrl: true, name: "l", description: "模型选择" } satisfies Keybind,
	/** 供应商选择弹窗 */
	openProviders: { ctrl: true, name: "p", description: "供应商选择" } satisfies Keybind,
	/** 指令帮助弹窗 */
	openHelp: { ctrl: true, name: "o", description: "指令集" } satisfies Keybind,
} as const;

/** 检查 KeyEvent 是否匹配某个快捷键 */
export function matchesKeybind(key: KeyEvent, bind: Keybind): boolean {
	return (
		key.name === bind.name &&
		!!key.ctrl === !!bind.ctrl &&
		!!key.meta === !!bind.meta
	);
}

/** 格式化为显示字符串（如 "Ctrl+L"） */
export function formatKeybind(bind: Keybind): string {
	const parts: string[] = [];
	if (bind.ctrl) parts.push("Ctrl");
	if (bind.meta) parts.push("Alt");
	parts.push(bind.name.toUpperCase());
	return parts.join("+");
}
