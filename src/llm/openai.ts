import OpenAI from "openai";
import type {
	ChatCompletionMessageParam,
	ChatCompletionChunk,
} from "openai/resources";
import type { ChatOptions, ChatEvent, ToolCall } from "../types.ts";
import type { LLMProvider } from "./provider.ts";

export class OpenAIProvider implements LLMProvider {
	private client: OpenAI;

	constructor() {
		const apiKey = process.env.OPENAI_API_KEY;
		if (!apiKey) {
			throw new Error("请设置 OPENAI_API_KEY 环境变量");
		}
		this.client = new OpenAI({ apiKey });
	}

	/**
	 * 以流式方式调用 LLM，逐块返回响应事件
	 * @param options 调用参数（模型、消息、工具列表、取消信号等）
	 * @yields ChatEvent 流式事件：文本增量、工具调用、完成通知或错误
	 */
	async *chat(options: ChatOptions): AsyncIterable<ChatEvent> {
		try {
			// 1. 消息转换为 openAI 标准消息格式
			const openaiMessage = options.message.map(toOpenAIMessage);

			// 2. 构建 tools 参数（如果有）
			const tools = options.tools?.map((t) => ({
				type: "function" as const,
				function: {
					name: t.name,
					description: t.description,
					parameters: t.parameters,
				},
			}));

			// 3. 发起 streaming 请求
			const stream = await this.client.chat.completions.create({
				model: options.model,
				messages: openaiMessage,
				tools: tools,
				stream: true,
			});

			// 4. 逐 chunk 解析
			const toolCallAccumulator = new ToolCallAccumulator();

			for await (const chunk of stream) {
				const delta = chunk.choices?.[0]?.delta;
				if (!delta) continue;

				// 事件A: LLM 输出纯文本内容
				if (delta.content) {
					yield { type: "text_delta", delta: delta.content };
				}

				// 事件B: LLM 输出工具调用内容
				if (delta.tool_calls) {
					for (const tc_delta of delta.tool_calls) {
						toolCallAccumulator.add(tc_delta);
					}
				}

				// 事件C: LLM 输出通信完成讯息，视情况输出 token 用量信息
				if (chunk.choices?.[0]?.finish_reason) {
					const finishReason = chunk.choices[0].finish_reason;

					// 完成讯息原因 -> 工具调用
					if (finishReason == "tool_calls") {
						const calls = toolCallAccumulator.getCalls();
						if (calls.length > 0) {
							yield { type: "tool_calls", delta: calls };
						}
					}

					// 其他完成讯息原因 -> 通讯一般结束
					yield {
						type: "done",
						usage: chunk.usage
							? {
									promptTokens: chunk.usage.prompt_tokens,
									completionTokens: chunk.usage.completion_tokens,
									totalTokens: chunk.usage.total_tokens,
								}
							: undefined,
					};
				}
			}
		} catch (err) {
			// try {} 可能抛出多种结果，统一转为 Error 对象抛出去
			yield {
				type: "error",
				error: err instanceof Error ? err : new Error(String(err)),
			};
		}
	}
}

function toOpenAIMessage(
	msg: ChatOptions["message"][number],
): ChatCompletionMessageParam {
	switch (msg.role) {
		case "user":
			return { role: msg.role, content: msg.content };
		case "system":
			return { role: msg.role, content: msg.content };
		case "assistant":
			return {
				role: msg.role,
				content: msg.content,
				tool_calls: msg.tool_calls?.map((tc) => ({
					id: tc.id,
					type: "function" as const,
					function: {
						name: tc.name,
						arguments: JSON.stringify(tc.arguments),
					},
				})),
			};
		case "tool":
			return {
				role: msg.role,
				content: msg.content,
				tool_call_id: msg.tool_call_id,
			};
	}
}

class ToolCallAccumulator {
	private accum = new Map<
		number,
		{ id: string; name: string; arguments: string }
	>();

	add(tc: ChatCompletionChunk.Choice.Delta.ToolCall) {
		const index = tc.index;
		// 获取某次 toolCall 消息的历史增量消息
		const existing = this.accum.get(index) ?? {
			id: "",
			name: "",
			arguments: "",
		};

		// 拼接最新的chunk中携带的 toolCall 增量消息
		if (tc.id) existing.id += tc.id;
		if (tc.function?.name) existing.name += tc.function.name;
		if (tc.function?.arguments) existing.arguments += tc.function.arguments;

		// 更新某次 toolCall 的消息
		this.accum.set(index, existing);
	}

	getCalls(): ToolCall[] {
		const result: ToolCall[] = [];

		for (const [index, acc] of this.accum) {
			result.push({
				id: acc.id || `call_${index}`,
				name: acc.name,
				arguments: JSON.parse(acc.arguments || "{}"),
			});
		}
		return result;
	}
}
