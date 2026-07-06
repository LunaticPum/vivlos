import type { SlashCommand, StartupCommand } from "./types.ts";

/**
 * 命令注册表。
 *
 * 负责命令的注册、查找和列举。由 main.ts 创建后传给 TUI。
 */
export interface CommandRegistry {
	/** 注册 Slash 命令 */
	registerSlash(cmd: SlashCommand): void;
	/** 注册启动命令 */
	registerStartup(cmd: StartupCommand): void;

	/** 按名查找 Slash 命令 */
	getSlash(name: string): SlashCommand | undefined;
	/** 列出所有 Slash 命令（去重） */
	listSlash(): SlashCommand[];

	/** 按 flag 查找启动命令 */
	getStartup(flag: string): StartupCommand | undefined;
	/** 列出所有启动命令（去重） */
	listStartup(): StartupCommand[];
}

export function createCommandRegistry(): CommandRegistry {
	const slash = new Map<string, SlashCommand>();
	const startup = new Map<string, StartupCommand>();

	return {
		registerSlash(cmd) {
			slash.set(cmd.name, cmd);
		},

		registerStartup(cmd) {
			startup.set(cmd.flag, cmd);
			if (cmd.shortFlag) startup.set(cmd.shortFlag, cmd);
		},

		getSlash(name) {
			return slash.get(name);
		},

		listSlash() {
			return [...new Set(slash.values())];
		},

		getStartup(flag) {
			return startup.get(flag);
		},

		listStartup() {
			return [...new Set(startup.values())];
		},
	};
}