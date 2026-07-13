/**
 * useAgent - EventBus -> React state 桥接 hook
 *
 * 订阅 agent 生命周期事件，输出纯 state 供组件渲染。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";

// #region 类型

/**
 * 推理过程日志条目（thinking / tool），按事件顺序追加
 */
export type LogEntry =
	| { kind: "thinking"; text: string; done: boolean; turnIndex: number }
	| {
			kind: "tool";
			callId: string;
			name: string;
			result: string;
			done: boolean;
			turnIndex: number;
	  };

/**
 * 一轮对话中 tui 能用到并展示的所有信息，注意 Conversation Turn ≠ ReAct turn，需要区分
 */
export interface ConversationTurn {
	userInput: string;
	log: LogEntry[]; // 推理过程：thinking / tool 按顺序排列
	finalText: string; // agent 最终回复
	status: "running" | "complete" | "error" | "aborted";
	turnCount: number; // ReAct turn 计数，即 ReAct Loop 循环次数
	toolCount: number; // 工具调用次数
}

/**
 * tui hook 结果：将 hook 到的数据封装出来传给组件使用
 */
export interface UseAgentResult {
	conversationTurns: ConversationTurn[]; // 完整对话历史，保存每轮对话记录
	loading: boolean; // agent 是否正在运行
	error: string | null; // 错误信息
	submit: (text: string) => void;
	abort: () => void; // 打断当前 LLM 调用
}

// #endregion

// #region 辅助函数

// ── 文本提取 ──

/** 从 tool result 中提取可读文本 */
function extractToolText(raw: unknown): string {
	if (!raw || typeof raw !== "object") return String(raw ?? "");
	const r = raw as Record<string, unknown>;

	const details = r.details as Record<string, unknown> | undefined;
	if (
		details?.message &&
		typeof details.message === "string" &&
		details.message.trim()
	) {
		return details.message;
	}

	const content = r.content as
		| Array<{ type: string; text?: string }>
		| undefined;
	if (content) {
		const text = content
			.filter((c) => c.type === "text")
			.map((c) => c.text ?? "")
			.join("\n");
		if (text.trim()) return text;
	}

	return String(raw);
}

/** 从 messageSnapshot 中提取最后一个 thinking block 文本 */
function extractThinkingFromSnapshot(snapshot: unknown): string {
	if (!snapshot || typeof snapshot !== "object") return "";

	const msg = snapshot as Record<string, unknown>;
	const content = msg.content as
		| Array<{ type: string; thinking?: string }>
		| undefined;
	if (!content) return "";

	// 提取最新的 thinking 文本块
	const blocks = content.filter((c) => c.type === "thinking" && c.thinking);
	return blocks.length > 0 ? blocks[blocks.length - 1]!.thinking! : "";
}

// ── 不可变更新辅助 ──

/** 更新 conversation turns 数组中指定索引的 turn */
function updateCurrent(
	conversationTurns: ConversationTurn[],
	idx: number,
	fn: (t: ConversationTurn) => ConversationTurn,
): ConversationTurn[] {
	if (idx < 0) return conversationTurns;
	return conversationTurns.map((t, i) => (i === idx ? fn(t) : t));
}

/** 更新 log 中最后一个“未完成”的 thinking 条目 */
function updateLastThinking(
	log: LogEntry[],
	fn: (
		entry: Extract<LogEntry, { kind: "thinking" }>,
	) => Extract<LogEntry, { kind: "thinking" }>,
): LogEntry[] {
	for (let j = log.length - 1; j >= 0; j--) {
		const entry = log[j];
		if (entry.kind === "thinking" && !entry.done) {
			const updated = fn(entry);
			return [...log.slice(0, j), updated, ...log.slice(j + 1)];
		}
	}
	return log;
}

// #endregion

export function useAgent(
	agent: VivlosAgent,
	eventBus: EventBus,
): UseAgentResult {
	const [conversationTurns, setTurns] = useState<ConversationTurn[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// #region useAgent hook

	// ref 保存当前对话轮次在 conversation turns 数组里的索引
	const currentIdxRef = useRef(-1);
	useEffect(() => {
		const unsubs: (() => void)[] = [];

		// agent 开始运行
		unsubs.push(
			eventBus.on("agent:start", () => {
				setLoading(true);
				setError(null);
			}),
		);

		// 新的 ReAct turn 开始 -> 追加一个 thinking 条目
		unsubs.push(
			eventBus.on("agent:turn_start", () => {
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						turnCount: t.turnCount + 1,
						log: [
							...t.log,
							{
								kind: "thinking",
								text: "",
								done: false,
								turnIndex: t.turnCount,
							},
						],
					})),
				);
			}),
		);

		// 工具调用开始 -> 追加 tool 条目
		unsubs.push(
			eventBus.on("agent:toolCall_start", (e) => {
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						toolCount: t.toolCount + 1,
						log: [
							...t.log,
							{
								kind: "tool",
								callId: e.callId,
								name: e.toolName,
								result: "",
								done: false,
								turnIndex: t.turnCount,
							},
						],
					})),
				);
			}),
		);

		// 工具调用流式结果
		unsubs.push(
			eventBus.on("agent:toolCall_delta", (e) => {
				const text = extractToolText(e.partialResult);
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: t.log.map((entry) =>
							entry.kind === "tool" && entry.callId === e.callId
								? { ...entry, result: text }
								: entry,
						),
					})),
				);
			}),
		);

		// 工具调用结束
		unsubs.push(
			eventBus.on("agent:toolCall_end", (e) => {
				const text = extractToolText(e.result);
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: t.log.map((entry) =>
							entry.kind === "tool" && entry.callId === e.callId
								? { ...entry, result: text, done: true }
								: entry,
						),
					})),
				);
			}),
		);

		// thinking 流式更新 -> 同时从增量 delta 消息或快照 snapshot 中提取 thinking 文本，确保 thinking 文本完整
		unsubs.push(
			eventBus.on("agent:thinking_delta", (e) => {
				const text = extractThinkingFromSnapshot(e.messageSnapshot) || e.delta;
				if (!text) return;

				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: updateLastThinking(t.log, (entry) => ({ ...entry, text })),
					})),
				);
			}),
		);

		// thinking 结束 -> 标记最后一个 thinking 为 done
		unsubs.push(
			eventBus.on("agent:thinking_end", () => {
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: updateLastThinking(t.log, (entry) => ({
							...entry,
							done: true,
						})),
					})),
				);
			}),
		);

		// 文本流式更新 -> 实时写入 finalText（打字机效果） + 确保 Thinking 被正确关闭
		unsubs.push(
			eventBus.on("agent:message_delta", (e) => {
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						finalText: t.finalText + e.delta,
						log: updateLastThinking(t.log, (entry) => ({
							...entry,
							done: true,
						})),
					})),
				);
			}),
		);

		// agent 完成 -> 写入最终回复
		unsubs.push(
			eventBus.on("agent:complete", (e) => {
				setLoading(false);

				// setTurns 异步执行，先捕获 idx 避免重置 -1 后找不到目标 turn
				const idx = currentIdxRef.current;
				setTurns((prev) =>
					updateCurrent(prev, idx, (t) => ({
						...t,
						status: "complete" as const,
						finalText: e.finalMessage || t.finalText,
					})),
				);
				// 重置 turns 下标
				currentIdxRef.current = -1;
			}),
		);

		// 消费底层 Loop run 捕获的异常
		unsubs.push(
			eventBus.on("agent:error", (e) => {
				setLoading(false);

				const isAborted = e.error.message.toLowerCase().includes("abort");
				if (!isAborted) setError(e.error.message);

				const idx = currentIdxRef.current;
				setTurns((prev) =>
					updateCurrent(prev, idx, (t) => ({
						...t,
						status: isAborted ? ("aborted" as const) : ("error" as const),
					})),
				);
				// 重置 turns 下标
				currentIdxRef.current = -1;
			}),
		);

		return () => unsubs.forEach((fn) => fn());
	}, [eventBus]);

	// #endregion

	// #region 两个 Callback
	const abortRef = useRef<AbortController | null>(null);

	const submit = useCallback(
		(text: string) => {
			if (!text.trim()) return;
			currentIdxRef.current = conversationTurns.length; // 注意 turns 数组不能被清空，ChatArea 组件会渲染所有的 turns，从而确保终端的历史条目信息都可见

			setError(null);
			setTurns((prev) => [
				...prev,
				{
					userInput: text,
					log: [],
					finalText: "",
					status: "running",
					turnCount: 0,
					toolCount: 0,
				},
			]);

			// 每次提交创建新的 AbortController
			const controller = new AbortController();
			abortRef.current = controller;

			agent
				.prompt(text, controller.signal)
				.then((result) => {
					// 如果 loop 返回了 error 但没走 catch（比如 turn_end 里的 error 事件）
					if (result.error && !controller.signal.aborted) {
						setError(result.error.message);
					}
				})
				.catch((err) => {
					setError(
						`fatal: ${err instanceof Error ? err.message : String(err)}`,
					);
					setLoading(false);
					currentIdxRef.current = -1;
				});
		},
		[agent, conversationTurns.length],
	);

	/** 打断当前 LLM 调用 */
	const abort = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
			setLoading(false);
			const idx = currentIdxRef.current;
			setTurns((prev) =>
				updateCurrent(prev, idx, (t) => ({
					...t,
					status: "aborted" as const,
				})),
			);
			currentIdxRef.current = -1;
		}
	}, []);

	return { conversationTurns, loading, error, submit, abort };
}
