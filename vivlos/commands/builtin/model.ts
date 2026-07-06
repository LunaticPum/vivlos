import type { CommandContext, CommandResult, SlashCommand } from "../types.ts";

/**
 * /model —— 模型选择（当前为 stub）。
 *
 * TODO: 接入 model-selector 容器组件，
 * 实现 provider → model → key 三步选择流程。
 * 见 C4 createLLM.setCredential() / setDefault()。
 */
export const modelCommand: SlashCommand = {
	name: "model",
	description: "选择 LLM 模型（provider → model → key）",
	usage: "/model [search]",
	async execute(ctx: CommandContext, _args: string): Promise<CommandResult> {
		const providers = ctx.llm.listProviders();
		const current = `${ctx.llm.getDefaultProvider()}/${ctx.llm.getDefaultModelId()}`;
		const lines = [
			"## 模型选择",
			"",
			`当前: ${current}`,
			"",
			"可用 provider:",
			...providers.map((p) => {
				const models = ctx.llm.listModels(p);
				return `- \`${p}\` (${models.length} models)`;
			}),
			"",
			"> TODO: 模型选择器组件开发中，当前仅展示可用 provider",
		];
		return { consumed: true, feedback: lines.join("\n") };
	},
};