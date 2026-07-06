// —— pi sdk ——
import {
	agentLoop,
	type AgentContext,
	type AgentLoopConfig,
	type AgentMessage,
	type AgentTool,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Model, Api, Message } from "@earendil-works/pi-ai";

import type { SessionManager } from "@vivlos/agent/session/index.ts";
import type { MemoryManager } from "@vivlos/agent/memory/types.ts";
import type { PromptBuilder } from "@vivlos/agent/prompt/types.ts";
import type { LoopHooks } from "@vivlos/agent/loop/hooks/index.ts";

import { mapAgentEvent } from "./event-mapper.ts";
import type { LoopConfig, LoopResult, AgentLoopDeps } from "./types.ts";

export interface CreateAgentLoopParams {
	/** infra 装配 */
	readonly deps: AgentLoopDeps;

	/** ... */
	readonly memoryManager: MemoryManager;
	/** .. */
	readonly sessionManager: SessionManager;
	/** .. */
	readonly promptBuilder: PromptBuilder;
	/** .. */
	readonly hooks?: LoopHooks;
	/** .. */
	readonly tools?: AgentTool<any, any>[];
}

export function createAgentLoop(params: CreateAgentLoopParams) {
	const { deps, sessionManager, promptBuilder } = params;

	return {
		async run(
			userInput: string | AgentMessage[],
			config: LoopConfig,
		): Promise<LoopResult> {
			// ———— 1. 构造 user message(s) ————
			const prompts: AgentMessage[] =
				typeof userInput === "string"
					? [
							{
								role: "user",
								content: [{ type: "text", text: userInput }],
								timestamp: Date.now(),
							},
						]
					: userInput;

			// ———— 2. 注入 memory（P6）——每次 prompt 前加载持久化记忆和用户画像 ————
			promptBuilder.setMemory(""); // 先清空旧内容，防止上一轮 prompt 的 memory 残留
			if (params.memoryManager) {
				const memoryBlock = await params.memoryManager.buildPrompt();
				if (memoryBlock) {
					promptBuilder.setMemory(memoryBlock);
				}
			}

			// ———— 3. 构造 AgentContext ————
			const context: AgentContext = {
				systemPrompt: promptBuilder.build(),
				messages: [...sessionManager.getMessages()],
				tools: params.tools ?? [],
			};

			// ———— 4. 构造 streamFn —— 桥接 LLMClient → StreamFn ————
			const streamFn = ((model: Model<Api>, ctx: any, opts?: any) =>
				deps.llm.stream(model, ctx, {
					signal: opts?.signal,
				})) as unknown as StreamFn;

			// ———— 5. 组装 loop config ————
			const loopConfig: AgentLoopConfig = {
				model: config.model,
				convertToLlm: (messages: AgentMessage[]): Message[] => {
					return messages.filter(
						(m): m is Message =>
							m.role === "user" ||
							m.role === "assistant" ||
							m.role === "toolResult",
					);
				},
				...params.hooks,
			};

			let turn = 0;
			try {
				// 6. 启动 agentLoop —— 返回 EventStream<AgentEvent, AgentMessage[]>
				const stream = agentLoop(
					prompts,
					context,
					loopConfig,
					config.signal,
					streamFn,
				);

				// 7. 遍历事件流，映射到 VivlosEvent 发到 eventbus
				for await (const event of stream) {
					if (event.type === "turn_start") turn++;
					const vivlosEvents = mapAgentEvent(event, sessionManager.id, turn);
					for (const ve of vivlosEvents) deps.eventBus.emit(ve);
				}

				// 8. 拿最终结果
				const newMessages = await stream.result();

				// 9. 把所有新消息加到 session
				//    P6: newMessages 是 AgentMessage[]（可能含 CustomAgentMessages），
				//    session 只存储标准 Message（user/assistant/toolResult），
				//    非标准消息（如 BashExecutionMessage）跳过
				for (const m of newMessages) {
					if (
						m.role === "user" ||
						m.role === "assistant" ||
						m.role === "toolResult"
					) {
						sessionManager.appendMessage(m as Message);
					}
				}

				return { messages: newMessages, turns: turn };
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				deps.eventBus.emit({
					type: "agent:error",
					sessionId: sessionManager.id,
					error,
				});
				return { messages: [], turns: turn, error };
			}
		},
	};
}
