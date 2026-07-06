import type {
	CommandContext,
	CommandResult,
	SlashCommand,
} from "../../types.ts";

export const sessionCommand: SlashCommand = {
	name: "session",
	description: "查看当前会话信息",
	usage: "/session",
	async execute(ctx: CommandContext, _args: string): Promise<CommandResult> {
		const msgs = ctx.sessionManager.getMessages();
		const userMsgs = msgs.filter((m) => m.role === "user").length;
		const assistantMsgs = msgs.filter((m) => m.role === "assistant").length;
		const lines = [
			"## 会话信息",
			"",
			`- ID: ${ctx.sessionManager.id}`,
			`- 消息: ${msgs.length} (user: ${userMsgs}, assistant: ${assistantMsgs})`,
			`- 默认模型: ${ctx.llm.getDefaultProvider()}/${ctx.llm.getDefaultModelId()}`,
		];
		return { feedback: lines.join("\n") };
	},
};