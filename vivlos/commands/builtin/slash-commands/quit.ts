import type {
	CommandContext,
	CommandResult,
	SlashCommand,
} from "../../types.ts";

export const quitCommand: SlashCommand = {
	name: "quit",
	description: "退出 vivlos",
	usage: "/quit",
	async execute(ctx: CommandContext, _args: string): Promise<CommandResult> {
		ctx.shutdown();
		return { feedback: "再见" };
	},
};