import type { CommandContext, CommandResult, SlashCommand } from "../types.ts";

export const quitCommand: SlashCommand = {
	name: "quit",
	description: "退出 vivlos",
	usage: "/quit",
	async execute(_ctx: CommandContext, _args: string): Promise<CommandResult> {
		process.exit(0);
	},
};