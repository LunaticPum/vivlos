import type {
	CommandContext,
	CommandResult,
	SlashCommand,
} from "../../types.ts";

export const detailCommand: SlashCommand = {
	name: "detail",
	description: "展开/折叠当前 agent 推理细节",
	usage: "/detail",
	async execute(ctx: CommandContext, _args: string): Promise<CommandResult> {
		ctx.toggleDetail?.();
		return {
			feedback: ctx.expanded ? "推理细节已收起" : "推理细节已展开",
		};
	},
};