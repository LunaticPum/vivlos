// Agent 核心循环——调 LLM → 执行工具 → 继续，直到 LLM 直接回答

import type { Message, ToolCall, Usage } from "../types.ts";
import type { LLMProvider } from "../llm/provider.ts";
import type { ToolRegistry } from "../tools/registry.ts";

export interface AgentOptions {
	provider: LLMProvider;
	registry: ToolRegistry;
	model: string;
}

export interface AgentResponse {
	content: string;
	usage?: Usage;
	toolCalls: ToolCall[];
}

export class AgentLoop {
	private messages: Message[] = [];
	private options: AgentOptions;

	constructor(options: AgentOptions) {
		this.options = options;
	}

	/**
	 * ReAct Loop
	 */
	async run(userInput: string, signal?: AbortSignal): Promise<AgentResponse> {
		// 1. 追加用户 prompt 到对话历史消息中
		this.messages.push({
			role: "user",
			content: userInput,
		});

		// 2. Loop
		const allToolCalls: ToolCall[] = []; // 记录循环中调用的所有 tool
		let usage: Usage | undefined; // 记录 token 用量信息

		while (true) {
			const toolCalls: ToolCall[] = [];
			let finalContent = "";

			// 2a. Reasoning
			for await (const event of this.options.provider.chat({
				model: this.options.model,
				message: this.messages,
				tools: this.options.registry.getAll(),
				signal,
			})) {
				switch (event.type) {
					case "text_delta":
						finalContent += event.delta;
						break;
					case "tool_calls":
						toolCalls.push(...event.delta);
						break;
					case "done":
						usage = event.usage;
						break;
					case "error":
						throw event.error;
				}
			}

			// 2b. Acting
			if (toolCalls.length > 0) {
				// 追加 LLM Reasoning 响应到对话历史消息中
				this.messages.push({
					role: "assistant",
					content: finalContent,
					tool_calls: toolCalls,
				});

				// 逐个执行 Acting 阶段要执行的 tool，并将工具结果追加到对话历史消息中
				for (const tc of toolCalls) {
					const result = await this.options.registry.execute(
						tc.name,
						tc.arguments,
						signal,
					);
					this.messages.push({
						role: "tool",
						content: result,
						tool_call_id: tc.id,
					});
				}

				allToolCalls.push(...toolCalls); // 记录每轮循环调用的 tool
				continue; // 进入下一次 loop
			}

			// 2c. 没有工具调用，说明该轮 llm Reasoning 之后认为无须 Acting，循环结束
			return { content: finalContent, usage, toolCalls: allToolCalls };
		}
	}

	/**
	 * 获取当前对话的历史消息（只读）
	 */
	getMessage(): readonly Message[] {
		return this.messages;
	}
}
