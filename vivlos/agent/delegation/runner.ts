/**
 * Subagent Runner：运行一个完全独立上下文的受限 agentLoop。
 *
 * 泛化自 Consolidator runner 的模式：独立 AgentContext（专属 SP +
 * task_brief 首条消息 + 过滤后的工具集），不触碰 sessionManager /
 * history.jsonl / memory，只返回最后一条 assistant 文本与统计。
 */

import {
	agentLoop,
	type AgentContext,
	type AgentEvent,
	type AgentLoopConfig,
	type AgentMessage,
	type AgentTool,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, Message, Model, ThinkingLevel } from "@earendil-works/pi-ai";

import {
	buildBriefUserMessage,
	buildSubagentSystemPrompt,
} from "./prompts.ts";
import type {
	DelegationTaskSpec,
	SubagentRunResult,
	TaskKind,
} from "./types.ts";

/** 单个子任务的预算限制。 */
export interface SubagentBudget {
	readonly maxTurns: number;
	readonly timeoutMs: number;
}

/** 各任务类别的预算初始值。 */
export const KIND_BUDGETS: Record<TaskKind, SubagentBudget> = {
	exploring: { maxTurns: 20, timeoutMs: 5 * 60_000 },
	writing: { maxTurns: 40, timeoutMs: 15 * 60_000 },
};

export interface RunSubagentParams {
	readonly spec: DelegationTaskSpec;
	readonly tools: readonly AgentTool<any, any>[];
	readonly model: Model<Api>;
	readonly stream: StreamFn;
	readonly thinkingLevel?: ThinkingLevel;
	readonly budget?: SubagentBudget;
	/** 父级中止信号（delegate tool 的 signal 级联）。 */
	readonly signal?: AbortSignal;
	/** 子循环事件回调（实时进度用）。 */
	readonly onEvent?: (event: AgentEvent) => void;
}

/** 运行一个子 agent，返回结构化运行结果。 */
export async function runSubagent(
	params: RunSubagentParams,
): Promise<SubagentRunResult> {
	const startedAt = Date.now();
	const budget = params.budget ?? KIND_BUDGETS[params.spec.kind];
	validateBudget(budget);

	const context: AgentContext = {
		systemPrompt: buildSubagentSystemPrompt(params.spec.kind),
		messages: [],
		tools: [...params.tools],
	};
	const prompts: AgentMessage[] = [buildBriefUserMessage(params.spec)];
	const timeout = AbortSignal.timeout(budget.timeoutMs);
	const signal = params.signal
		? AbortSignal.any([params.signal, timeout])
		: timeout;

	let assistantTurns = 0;
	let turnLimited = false;
	const config: AgentLoopConfig = {
		model: params.model,
		reasoning: params.thinkingLevel,
		toolExecution: "sequential",
		convertToLlm: toLlmMessages,
		shouldStopAfterTurn: ({ newMessages }) => {
			assistantTurns = newMessages.filter(
				(message) => message.role === "assistant",
			).length;
			if (assistantTurns >= budget.maxTurns) {
				turnLimited = true;
				return true;
			}
			return false;
		},
	};

	let messages: readonly AgentMessage[];
	try {
		const stream = agentLoop(prompts, context, config, signal, params.stream);
		for await (const event of stream) {
			params.onEvent?.(event);
		}
		messages = await stream.result();
	} catch (error) {
		const base = {
			text: "",
			turns: assistantTurns,
			durationMs: Date.now() - startedAt,
		};
		if (timeout.aborted) {
			return {
				...base,
				state: "timeout",
				error: `运行超时（${Math.round(budget.timeoutMs / 60_000)} 分钟）`,
			};
		}
		if (signal.aborted) {
			return { ...base, state: "aborted", error: "已被父会话中止" };
		}
		return {
			...base,
			state: "error",
			error: error instanceof Error ? error.message : String(error),
		};
	}

	const base = {
		text: lastAssistantText(messages),
		turns: assistantTurns,
		durationMs: Date.now() - startedAt,
	};
	if (timeout.aborted) {
		return {
			...base,
			state: "timeout",
			error: `运行超时（${Math.round(budget.timeoutMs / 60_000)} 分钟）`,
		};
	}
	if (signal.aborted) {
		return { ...base, state: "aborted", error: "已被父会话中止" };
	}
	if (hasStopReason(messages, "error")) {
		return { ...base, state: "error", error: "模型 Provider 返回错误" };
	}
	if (turnLimited) {
		return {
			...base,
			state: "turn_limited",
			error: `达到轮次上限（${budget.maxTurns}），结果可能不完整`,
		};
	}
	return { ...base, state: "completed" };
}

// #region 辅助

function validateBudget(budget: SubagentBudget): void {
	for (const [name, value] of [
		["maxTurns", budget.maxTurns],
		["timeoutMs", budget.timeoutMs],
	] as const) {
		if (!Number.isSafeInteger(value) || value < 1) {
			throw new Error(`${name} 必须是正安全整数`);
		}
	}
}

function toLlmMessages(messages: AgentMessage[]): Message[] {
	return messages.filter(
		(message): message is Message =>
			message.role === "user" ||
			message.role === "assistant" ||
			message.role === "toolResult",
	);
}

function lastAssistantText(messages: readonly AgentMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role !== "assistant") continue;
		const text = message.content
			.filter(
				(part): part is { type: "text"; text: string } =>
					part.type === "text",
			)
			.map((part) => part.text)
			.join("")
			.trim();
		if (text) return text;
	}
	return "";
}

function hasStopReason(
	messages: readonly AgentMessage[],
	reason: "error",
): boolean {
	return messages.some(
		(message) => message.role === "assistant" && message.stopReason === reason,
	);
}

// #endregion
