/**
 * Consolidator Runtime。
 *
 * 只运行一次独立的受限 agentLoop；成功的独立 Memory 操作不做回滚，
 * 但只有模型自然完成本次审视后才推进 History cursor。
 */

import {
	agentLoop,
	type AgentContext,
	type AgentMessage,
	type AgentLoopConfig,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, Message, Model } from "@earendil-works/pi-ai";

import { log } from "@vivlos/infra/logger/index.ts";
import type {
	MemoryRepository,
} from "@vivlos/infra/storage/memory/index.ts";
import type { History } from "@vivlos/infra/storage/memory/history.ts";
import type {
	MemoryOperationContext,
	MemoryService,
} from "../service.ts";
import type { TriggerDecision } from "./trigger.ts";
import { buildPrompt } from "./prompt.ts";
import { createConsolidateTool } from "@vivlos/agent/tools/advanced/memory/consolidate.ts";

// #region Runner 契约

export interface RunnerConfig {
	readonly maxTurns: number;
	readonly maxTools: number;
	readonly timeoutMs: number;
}

export interface RunnerDeps {
	readonly stream: StreamFn;
	readonly repository: MemoryRepository;
	readonly history: History;
	readonly memoryService: MemoryService;
	readonly config: RunnerConfig;
}

export interface RunInput {
	readonly decision: TriggerDecision;
	readonly model: Model<Api>;
	readonly sessionId: string;
	readonly signal?: AbortSignal;
}

export type RunStatus = "completed" | "failed" | "aborted" | "busy";

export type RunErrorCode =
	| "busy"
	| "cursor_changed"
	| "timeout"
	| "aborted"
	| "output_limit"
	| "provider_error"
	| "tool_error"
	| "run_limit"
	| "cursor_save_failed"
	| "runtime_error";

export interface RunError {
	readonly code: RunErrorCode;
	readonly message: string;
}

interface RunResultBase {
	readonly status: RunStatus;
	readonly reason: TriggerDecision["reason"];
	readonly toolCalls: number;
	readonly cursorBefore: number;
	readonly cursorAfter: number;
}

export type RunResult =
	| (RunResultBase & { readonly status: "completed" })
	| (RunResultBase & {
			readonly status: "failed" | "aborted" | "busy";
			readonly error: RunError;
	  });

export interface Runner {
	run(input: RunInput): Promise<RunResult>;
}

// #endregion

// #region Runner 主入口

/** 创建单飞的 Consolidator Runtime。 */
export function createRunner(deps: RunnerDeps): Runner {
	let active = false;

	return {
		async run(input) {
			if (active) {
				return failure(input, "busy", 0, input.decision.cursor, {
					code: "busy",
					message: "Consolidator 当前已有运行中的审视",
				});
			}

			active = true;
			try {
				return await runOnce(deps, input);
			} catch (error) {
				return fail(input, input.decision.cursor, 0, "runtime_error", error);
			} finally {
				active = false;
			}
		},
	};
}

// #endregion

// #region 单次运行

async function runOnce(deps: RunnerDeps, input: RunInput): Promise<RunResult> {
	validateRun(deps.config, input);
	const cursor = deps.history.readCursor();
	if (cursor !== input.decision.cursor) {
		log("warn", "Consolidator 已跳过过期的 Trigger Decision", undefined, true);
		return failure(input, "failed", 0, cursor, {
			code: "cursor_changed",
			message: "Trigger Decision 使用的 cursor 已经过期",
		});
	}

	const snapshot = deps.repository.readSnapshot();
	const prompt = buildPrompt({ snapshot, decision: input.decision });
	let tools = 0;
	let limited = false;
	const tool = createConsolidateTool({
		memoryService: deps.memoryService,
		getOperationContext: () => operationContext(input),
	});

	const context: AgentContext = {
		systemPrompt: prompt.system,
		messages: [],
		tools: [tool],
	};
	const prompts: AgentMessage[] = [
		{
			role: "user",
			content: [{ type: "text", text: prompt.user }],
			timestamp: Date.now(),
		},
	];
	const timeout = AbortSignal.timeout(deps.config.timeoutMs);
	const signal = input.signal
		? AbortSignal.any([input.signal, timeout])
		: timeout;
	const config: AgentLoopConfig = {
		model: input.model,
		toolExecution: "sequential",
		convertToLlm: toMessages,
		beforeToolCall: async () => {
			if (tools >= deps.config.maxTools) {
				limited = true;
				return {
					block: true,
					reason: "Consolidator 已达到本次 Tool 调用上限",
				};
			}
			tools++;
			return undefined;
		},
		shouldStopAfterTurn: ({ newMessages }) => {
			if (limited) return true;
			const turns = newMessages.filter((message) => message.role === "assistant").length;
			if (turns >= deps.config.maxTurns) {
				limited = true;
				return true;
			}
			return false;
		},
	};

	const stream = agentLoop(prompts, context, config, signal, deps.stream);
	for await (const _event of stream) {
		// Runtime 不把主 Agent 的过程事件映射到 TUI；这里只等待完整结果。
	}
	const messages = await stream.result();
	if (signal.aborted || input.signal?.aborted) {
		const code = timeout.aborted ? "timeout" : "aborted";
		log(
			code === "timeout" ? "error" : "warn",
			`Consolidator 运行已中断：${code}`,
			undefined,
			true,
		);
		return failure(
			input,
			"aborted",
			tools,
			cursor,
			{ code, message: "Consolidator 运行已中断" },
		);
	}
	if (hasStopReason(messages, "length")) {
		return fail(
			input,
			cursor,
			tools,
			"output_limit",
			new Error("Consolidator 输出达到模型 token 上限"),
		);
	}
	if (hasModelError(messages)) {
		return fail(
			input,
			cursor,
			tools,
			"provider_error",
			new Error("Consolidator Provider 返回错误"),
		);
	}
	if (limited) {
		log("warn", "Consolidator 达到本次运行限制", undefined, true);
		return failure(input, "failed", tools, cursor, {
			code: "run_limit",
			message: "Consolidator 达到本次运行限制",
		});
	}
	if (hasToolError(messages)) {
		return fail(
			input,
			cursor,
			tools,
			"tool_error",
			new Error("Consolidate Tool 执行失败"),
		);
	}
	try {
		const after = deps.history.saveCursor(input.decision.tail);
		return success(input, tools, cursor, after);
	} catch (error) {
		return fail(input, cursor, tools, "cursor_save_failed", error);
	}
}

// #endregion

// #region 辅助

function validateRun(config: RunnerConfig, input: RunInput): void {
	if (!input.sessionId.trim()) throw new Error("sessionId 不能为空");
	for (const [name, value] of [
		["maxTurns", config.maxTurns],
		["maxTools", config.maxTools],
		["timeoutMs", config.timeoutMs],
	] as const) {
		if (!Number.isSafeInteger(value) || value < 1) {
			throw new Error(`${name} 必须是正安全整数`);
		}
	}
}

function operationContext(input: RunInput): MemoryOperationContext {
	return {
		sessionId: input.sessionId,
		reasonCode: "memory_consolidation",
		reason: `trigger:${input.decision.reason}`,
	};
}

function toMessages(messages: AgentMessage[]): Message[] {
	return messages.filter(
		(message): message is Message =>
			message.role === "user" ||
			message.role === "assistant" ||
			message.role === "toolResult",
	);
}

function hasModelError(messages: readonly AgentMessage[]): boolean {
	return hasStopReason(messages, "error") || hasStopReason(messages, "aborted");
}

function hasStopReason(
	messages: readonly AgentMessage[],
	reason: "error" | "aborted" | "length",
): boolean {
	return messages.some(
		(message) => message.role === "assistant" && message.stopReason === reason,
	);
}

function hasToolError(messages: readonly AgentMessage[]): boolean {
	return messages.some(
		(message) => message.role === "toolResult" && message.isError === true,
	);
}

function success(
	input: RunInput,
	toolCalls: number,
	cursorBefore: number,
	cursorAfter: number,
): RunResult {
	return {
		status: "completed",
		reason: input.decision.reason,
		toolCalls,
		cursorBefore,
		cursorAfter,
	};
}

function failure(
	input: RunInput,
	status: "failed" | "aborted" | "busy",
	toolCalls: number,
	cursor: number,
	error: RunError,
): RunResult {
	return {
		status,
		reason: input.decision.reason,
		toolCalls,
		cursorBefore: cursor,
		cursorAfter: cursor,
		error,
	};
}

function fail(
	input: RunInput,
	cursor: number,
	toolCalls: number,
	code: RunErrorCode,
	error: unknown,
): RunResult {
	const cause = error instanceof Error ? error : new Error(String(error));
	log("error", `Consolidator Runtime 失败：${code}`, cause, true);
	return failure(input, "failed", toolCalls, cursor, {
		code,
		message: cause.message,
	});
}

// #endregion
