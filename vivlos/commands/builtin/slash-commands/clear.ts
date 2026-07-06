import type {
	CommandContext,
	CommandResult,
	SlashCommand,
} from "../../types.ts";

export const clearCommand: SlashCommand = {
	name: "clear",
	description: "清空当前会话消息",
	usage: "/clear",
	async execute(ctx: CommandContext, _args: string): Promise<CommandResult> {
		ctx.sessionManager.reset();
		return { feedback: "会话已清空" };
	},
};