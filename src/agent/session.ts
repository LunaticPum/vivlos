// 封装 AgentLoop，提供更简单的 prompt() 接口 API，管理 system prormpt

import { AgentLoop } from "./loop.ts";
import type { LLMProvider } from "../llm/provider.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { Message } from "../types.ts";

export interface SessionOptions {
	provider: LLMProvider;
	registry: ToolRegistry;
	model: string;
	systemPrompt?: string;
}

export class AgentSession {
	private loop: AgentLoop;
	private systemPrompt: string;
	private systemInjected = false; // 控制 「 system prompt 只注入一次 」 的行为，确保 system prompt 在整个会话生命周期只出现一次

	constructor(options: SessionOptions) {
		// 如果没有显式传入指定的系统提示词，则默认的系统提示词为指定 agent 为编程 agent 助手
		this.systemPrompt =
			options.systemPrompt ??
			`
    You are a helpful coding agent with access to file system tools.
    When you need to read, write, edit files or execute shell commands,
    use the appropriate tools. Otherwise, answer directly.
    `;

		this.loop = new AgentLoop({
			provider: options.provider,
			registry: options.registry,
			model: options.model,
		});
	}

	async prompt(input: string): Promise<string> {
		if (!this.systemInjected) {
			const messages = this.loop["messages"] as Message[]; // 通过 loop["message"] 获取 AgentLoop 实例的私有字段 message，并通过类型断言 as Message[] 显示声明 messages 类型
			messages.unshift({ role: "system", content: this.systemPrompt }); // unshift：在数组头部插入一个或多个元素，system prompt 一般作为消息列表中的第一条消息
			this.systemInjected = true;
		}

		const response = await this.loop.run(input);
		return response.content;
	}
}
