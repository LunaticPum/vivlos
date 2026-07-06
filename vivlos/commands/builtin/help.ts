import type { CommandContext, CommandResult, SlashCommand } from "../types.ts";

export const helpCommand: SlashCommand = {
	name: "help",
	description: "列出所有可用命令",
	usage: "/help",
	async execute(ctx: CommandContext, _args: string): Promise<CommandResult> {
		const list = ctx.registry.listSlash();
		const lines = ["## 可用命令", ""];
		for (const cmd of list) {
			lines.push(`- \`/${cmd.name}\` — ${cmd.description}`);
		}
		lines.push("", `共 ${list.length} 个命令`);
		return { consumed: true, feedback: lines.join("\n") };
	},
};