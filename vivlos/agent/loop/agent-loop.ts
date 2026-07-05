// vivlos/agent/loop/agent-loop.ts
import {
	agentLoop,
	type AgentEvent,
	type AgentContext,
	type AgentLoopConfig,
	type AgentMessage,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Model, Api, Message } from "@earendil-works/pi-ai";
import type { VivlosSession } from "../session/types.ts";
import type { PromptBuilder } from "../prompt/types.ts";
import type { VivlosLoopHooks } from "./hooks/index.ts";
import type { MemoryManager } from "../memory/types.ts";
import { mapAgentEvent } from "./event-mapper.ts";
import type {
	VivlosLoopConfig,
	VivlosLoopResult,
	AgentLoopDeps,
} from "./types.ts";

export interface CreateAgentLoopParams {
	readonly deps: AgentLoopDeps;
	readonly session: VivlosSession;
	readonly promptBuilder: PromptBuilder;
	readonly hooks?: VivlosLoopHooks;
	/** 工具列表（P5），传入 AgentContext.tools。由 pi agentLoop 自动调度 tool calling 全流程 */
	readonly tools?: AgentTool<any, any>[];
	/**
	 * MemoryManager（P6），每次 prompt 前注入 memory 块到 system prompt。
	 * 可选——不传则跳过 memory 注入（保持 P5 行为）。
	 */
	readonly memoryManager?: MemoryManager;
}

export function createAgentLoop(params: CreateAgentLoopParams) {
	const { deps, session, promptBuilder } = params;

	return {
		async run(
			userInput: string | AgentMessage[],
			config: VivlosLoopConfig,
		): Promise<VivlosLoopResult> {
			// 1. 构造 user message(s)
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

			// 2. 注入 memory（P6）——每次 prompt 前加载持久化记忆和用户画像
			//    先清空旧内容，防止上一轮 prompt 的 memory 残留
			promptBuilder.setMemory("");
			if (params.memoryManager) {
				const memoryBlock = await params.memoryManager.buildPrompt();
				// TODO: memory 块应放在 prompt builder 的身份定义之后、
				// rules 之前（参照 Hermes system prompt 布局），当前放在末尾
				promptBuilder.setMemory(memoryBlock);
			}

			// 3. 构造 AgentContext（含工具列表）
			const context: AgentContext = {
				systemPrompt: promptBuilder.build(),
				messages: [...session.getMessages()],
				tools: params.tools ?? [],
			};

			// 4. 构造 streamFn —— 桥接 LLMClient → StreamFn
			const streamFn = ((model: Model<Api>, ctx: any, opts?: any) =>
				deps.llm.stream(model, ctx, {
					signal: opts?.signal,
				})) as unknown as StreamFn;

			// 5. 组装 loop config —— 透传外层 hooks
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
					const vivlosEvents = mapAgentEvent(event, session.id, turn);
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
						session.appendMessage(m as Message);
					}
				}

				return { messages: newMessages, turns: turn };
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				deps.eventBus.emit({
					type: "agent:error",
					sessionId: session.id,
					error,
				});
				return { messages: [], turns: turn, error };
			}
		},
	};
}
