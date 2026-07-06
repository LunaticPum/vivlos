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
import { VivlosError } from "@vivlos/shared";

/**
 * agentLoop 创建参数——组合根注入的依赖集合。
 */
export interface CreateAgentLoopParams {
	/** LLM + EventBus 基础依赖 */
	readonly deps: AgentLoopDeps;

	/** MemoryManager —— 记忆存储管理 + system prompt 注入块封装（记忆内容 + 用户画像） */
	readonly memoryManager: MemoryManager;
	/** SessionManager —— 消息存储管理 */
	readonly sessionManager: SessionManager;
	/** PromptBuilder —— system prompt 组装 */
	readonly promptBuilder: PromptBuilder;
	/** 可选 loop 控制 hook（maxTurns / steering / followUp） */
	readonly hooks?: LoopHooks;
	/** 工具列表 —— 传入 AgentContext.tools，由 pi agentLoop 调度 tool calling */
	readonly tools?: AgentTool<any, any>[];
}

/**
 * 创建 agent 主循环。
 *
 * 封装 pi 的 agentLoop()，编排一次完整的 LLM 对话：
 *   1. 构造 prompt 消息
 *   2. 注入 memory 到 system prompt
 *   3. 组装 AgentContext
 *   4. 桥接 streamFn（LLMClient → pi StreamFn）
 *   5. 组装 loop config
 *   6. 启动 pi agentLoop
 *   7. 遍历事件流 → 映射为 VivlosEvent → 发到 eventbus
 *   8. 拿最终消息列表
 *   9. 追加新消息到 session
 */
export function createAgentLoop(params: CreateAgentLoopParams) {
	const { deps, sessionManager, promptBuilder } = params;

	return {
		async run(
			userInput: string | AgentMessage[],
			config: LoopConfig,
		): Promise<LoopResult> {
			// ——— 1. 构造 user message(s) ———
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

			// ——— 2. 注入 memory —— 每次 prompt 前加载持久化记忆和用户画像 ———
			promptBuilder.setMemory(""); // 先清空，防止上一轮残留
			if (params.memoryManager) {
				const memoryBlock = await params.memoryManager.buildPrompt();
				if (memoryBlock) {
					promptBuilder.setMemory(memoryBlock);
				}
			}

			// ——— 3. 构造 AgentContext ———
			const context: AgentContext = {
				systemPrompt: promptBuilder.build(),
				messages: [...sessionManager.getMessages()],
				tools: params.tools ?? [],
			};

			// ——— 4. 构造 streamFn —— 桥接 LLMClient → StreamFn ———
			const streamFn = ((model: Model<Api>, ctx: any, opts?: any) =>
				deps.llm.stream(model, ctx, {
					signal: opts?.signal,
				})) as unknown as StreamFn;

			// ——— 5. 组装 loop config ———
			const loopConfig: AgentLoopConfig = {
				model: config.model,
				// 过滤 AgentMessage → 标准 Message（只保留 user/assistant/toolResult）
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
				// ——— 6. 启动 agentLoop ———
				const stream = agentLoop(
					prompts,
					context,
					loopConfig,
					config.signal,
					streamFn,
				);

				// ——— 7. 遍历事件流 → 映射为 VivlosEvent → 发到 eventbus ———
				for await (const event of stream) {
					if (event.type === "turn_start") turn++;
					const vivlosEvents = mapAgentEvent(event, sessionManager.id, turn);
					for (const ve of vivlosEvents) deps.eventBus.emit(ve);
				}

				// ——— 8. 拿最终消息列表 ———
				const newMessages = await stream.result();

				// ——— 9. 追加新消息到 session ———
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
				// ———— 异常处理 ————
				if (err instanceof VivlosError) {
					// —— 已知异常 ——

					return { messages: [], turns: turn, error: err };
				} else {
					// —— 未知异常 ——
					const error = err instanceof Error ? err : new Error(String(err));
					// agent:error → TUI 显示用
					deps.eventBus.emit({
						type: "agent:error",
						sessionId: sessionManager.id,
						error,
					});
					// log → MarkdownLogWriter 持久化用
					deps.eventBus.emit({
						type: "log",
						level: "error",
						message: error.message,
						error,
					});
					return { messages: [], turns: turn, error };
				}
			}
		},
	};
}
