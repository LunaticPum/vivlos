/**
 * Dreaming -- 记忆审视（参照 Hermes Loop 步骤 8，01-arch.md §2.1）。
 *
 * 每轮对话结束后"做梦"：审视本轮内容，把值得记的沉淀到长期记忆。
 * 有料 -> 写入 memory.md / user.md；无料 -> 跳过。
 *
 * 写盘不影响当前 session 的 SP（Frozen Snapshot），下个 session 才生效。
 */

import {
	agentLoop,
	type AgentContext,
	type AgentLoopConfig,
	type AgentMessage,
	type AgentEvent,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Message, Model, Api } from "@earendil-works/pi-ai";
import type { MemoryStore } from "../types.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import { log } from "@vivlos/infra/logger/index.ts";
import { createMaxTurnsHook } from "@vivlos/agent/loop/hooks/index.ts";
import {
	createMemoryTool,
	type MemoryToolDetails,
} from "@vivlos/agent/tools/advanced/memory/memory.ts";
import { buildDreamingContext } from "./context.ts";

// #region 类型

export interface DreamingOptions {
	llm: LLMClient;
	model: Model<Api>;
	/** 本轮新增的消息 */
	messages: Message[];
	/** 统一的安全记忆写入入口 */
	memoryStore: MemoryStore;
	signal?: AbortSignal;
}

// #endregion

/** 限制自动审视成本，达到上限后在当前 Turn 完成时正常退出。 */
const MAX_DREAMING_TURNS = 4;

// #region 主入口

/**
 * Dreaming 审视。
 *
 * 失败时静默跳过（不影响主流程），仅 log 记录。
 */
export async function dreaming(options: DreamingOptions): Promise<void> {
	const { llm, model, messages, memoryStore, signal } = options;

	if (messages.length === 0) return;

	try {
		// 1. 构造独立审视请求，仅向审视模型开放 memory tool
		const review = buildDreamingContext(messages, memoryStore);
		const prompts = review.messages as AgentMessage[];
		const context: AgentContext = {
			systemPrompt: review.systemPrompt,
			messages: [],
			tools: [createMemoryTool({ memoryStore })],
		};

		// TODO(subagents): 引入统一 subagent runtime 后，将此处迁移为 Memory subagent，
		// 复用工具白名单、轮次限制与生命周期管理，删除本地 Agent Loop 组装。
		// 2. 启动受限 Agent Loop，tool result 会自动回灌给审视模型
		const stream = agentLoop(
			prompts,
			context,
			createLoopConfig(model),
			signal,
			createStreamFn(llm),
		);
		let written = 0;
		for await (const event of stream) {
			if (isWrittenMutation(event)) written++;
		}
		await stream.result();

		// 3. 审视器最终文本不进入主 session，仅通知真实记忆变更次数
		if (written > 0) {
			log("info", `Dreaming: 完成 ${written} 次记忆变更`, undefined, true);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log("warn", `Dreaming 审视跳过: ${msg}`);
	}
}

// #endregion

// #region 工具函数

/** Dreaming 使用标准 LLM 消息，不保留主 Agent 的自定义消息。 */
function createLoopConfig(model: Model<Api>): AgentLoopConfig {
	return {
		model,
		toolExecution: "sequential",
		convertToLlm: (messages: AgentMessage[]): Message[] =>
			messages.filter(
				(message): message is Message =>
					message.role === "user" ||
					message.role === "assistant" ||
					message.role === "toolResult",
			),
		// 同一 Turn 的多个写操作无法利用彼此结果，统一拒绝后让模型逐步重试。
		beforeToolCall: async ({ assistantMessage }) => {
			const memoryCalls = assistantMessage.content.filter(
				(content) => content.type === "toolCall" && content.name === "memory",
			);
			if (memoryCalls.length <= 1) return undefined;
			return {
				block: true,
				reason: "Dreaming 每轮只允许一个 memory 操作，请等待本次结果后再继续策展。",
			};
		},
		// Store 业务错误进入 toolResult；unsafe_content 额外终止本次自动审视。
		afterToolCall: async ({ result, isError }) => {
			if (isError) return undefined;
			const details = result.details as MemoryToolDetails | undefined;
			const mutation = details?.mutation;
			if (!mutation) return { isError: true };
			if (mutation.ok) return undefined;

			if (mutation.error.code === "unsafe_content") {
				log("warn", `Dreaming: 安全拒绝并终止审视：${mutation.error.message}`);
				return { isError: true, terminate: true };
			}
			return { isError: true };
		},
		...createMaxTurnsHook(MAX_DREAMING_TURNS),
	};
}

/** 桥接 Vivlos LLMClient 与 pi Agent Loop。 */
function createStreamFn(llm: LLMClient): StreamFn {
	return (model, context, options) =>
		llm.stream(model, context, {
			signal: options?.signal,
			reasoning: options?.reasoning,
		});
}

/** 仅统计真正改变 Markdown 的 memory tool 调用。 */
function isWrittenMutation(event: AgentEvent): boolean {
	if (event.type !== "tool_execution_end" || event.toolName !== "memory") {
		return false;
	}
	const details = event.result.details as MemoryToolDetails | undefined;
	return Boolean(
		details?.mutation?.ok && details.mutation.value.status === "written",
	);
}

// #endregion
