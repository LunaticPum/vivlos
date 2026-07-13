/**
 * TUI 命令注册表
 *
 * 负责命令的注册、查找和列举。
 * 由 ChatPanel 懒初始化创建，builtin/index.ts 负责注册内置指令。
 */

import type { TUICommand } from "./types.ts";

export interface TUICommandRegistry {
	/** 注册一条指令 */
	register(cmd: TUICommand): void;
	/** 按名查找指令 */
	get(name: string): TUICommand | undefined;
	/** 列出所有已注册指令 */
	list(): TUICommand[];
}

export function createTUICommandRegistry(): TUICommandRegistry {
	const commands = new Map<string, TUICommand>();

	return {
		register(cmd) {
			commands.set(cmd.name, cmd);
		},

		get(name) {
			return commands.get(name);
		},

		list() {
			return [...commands.values()];
		},
	};
}
