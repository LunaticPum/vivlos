/**
 * useAgent - EventBus -> React state 桥接 hook
 *
 * 订阅 agent 生命周期事件，输出纯 state 供组件渲染。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { Usage, Message, TextContent } from "@earendil-works/pi-ai";
import type { EventBus, TodoList } from "@vivlos/infra/eventbus/index.ts";
import type { MemoryOverview } from "@vivlos/infra/storage/memory/index.ts";
import type { L2Overview } from "@vivlos/infra/storage/memory/index.ts";
import type { SessionMeta } from "@vivlos/infra/storage/session/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import { log } from "@vivlos/infra/logger/logger.ts";

// #region 类型

/**
 * 推理过程日志条目（thinking / tool），按事件顺序追加
 */
export type LogEntry =
	| {
			kind: "thinking";
			text: string;
			done: boolean;
			outcome?: "complete" | "error" | "aborted";
			turnIndex: number;
			createdAt: number;
			durationMs?: number;
	  }
	| {
			kind: "tool";
			callId: string;
			name: string;
			source: "main" | "consolidator";
			args?: unknown;
			result: string;
			done: boolean;
			success?: boolean;
			runMarker?: boolean;
			turnIndex: number;
			createdAt: number;
	  };

/**
 * 一轮对话中 tui 能用到并展示的所有信息，注意 Conversation Turn ≠ ReAct turn，需要区分
 */
export interface ConversationTurn {
	userInput: string;
	log: LogEntry[];
	finalText: string;
	status: "running" | "complete" | "error" | "aborted";
	turnCount: number;
	toolCount: number;
	termination?: {
		kind: "error" | "aborted";
		message: string;
	};
	retry?: {
		attempt: number;
		maxAttempts: number;
		delayMs: number;
		errorMessage: string;
	};
	/** 最近一次 assistant 消息的 token 用量 */
	usage?: Usage;
}

export interface CurrentSessionState {
	readonly id: string;
	readonly name: string | null;
	readonly pending: boolean;
	readonly messageCount: number;
}

/**
 * tui hook 结果：将 hook 到的数据封装出来传给组件使用
 */
export interface UseAgentResult {
	conversationTurns: ConversationTurn[];
	loading: boolean;
	currentSession: CurrentSessionState | null;
	sessions: readonly SessionMeta[];
	memoryOverview: MemoryOverview | null;
	/** L2 索引概览（Workspace 级，不随 Session 切换重置）。 */
	l2Overview: L2Overview | null;
	/** 当前 Session 的完整 Todo List。 */
	todoList: TodoList | null;
	submit: (text: string) => void;
	abort: () => void;
	clearConversation: () => void;
	switchSession: (sessionId: string) => void;
	deleteSession: (sessionId: string) => void;
	renameSession: (name: string) => void;
	compact: VivlosAgent["compact"];
	/** 创建新 session 并重置 TUI */
	newSession: () => void;
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

/** 冻结所有未完成日志，避免终止后的计时和 spinner 继续运行。 */
function finishPendingLog(
	log: LogEntry[],
	outcome: "complete" | "error" | "aborted",
	reason = "",
	endedAt = Date.now(),
): LogEntry[] {
	return log.map((entry) => {
		if (entry.kind === "thinking" && !entry.done) {
			return {
				...entry,
				done: true,
				outcome,
				durationMs: Math.max(0, endedAt - entry.createdAt),
			};
		}
		if (outcome !== "complete" && entry.kind === "tool" && !entry.done) {
			return { ...entry, done: true, success: false, result: reason };
		}
		return entry;
	});
}

function completeTool(
	log: LogEntry[],
	callId: string,
	result: string,
	success: boolean,
): LogEntry[] {
	return log.map((entry) =>
		entry.kind === "tool" && entry.callId === callId
			? { ...entry, result, success, done: true }
			: entry,
	);
}

function completeConsolidateRun(
	log: LogEntry[],
	result: string,
	success: boolean,
): LogEntry[] {
	for (let index = log.length - 1; index >= 0; index--) {
		const entry = log[index];
		if (
			entry.kind === "tool" &&
			entry.source === "consolidator" &&
			entry.runMarker &&
			!entry.done
		) {
			return [
				...log.slice(0, index),
				{ ...entry, result, success, done: true },
				...log.slice(index + 1),
			];
		}
	}
	return log;
}

/** 从 Message 数组重建 ConversationTurn[]（用于 session 切换后恢复历史） */
function messagesToTurns(messages: readonly Message[]): ConversationTurn[] {
	const turns: ConversationTurn[] = [];
	let cur: ConversationTurn | null = null;

	for (const msg of messages) {
		if (msg.role === "user") {
			const text = typeof msg.content === "string"
				? msg.content
				: msg.content.filter((c): c is TextContent => c.type === "text").map((c) => c.text).join("");
			if (cur) turns.push(cur);
			cur = { userInput: text, log: [], finalText: "", status: "complete", turnCount: 0, toolCount: 0 };
		} else if (msg.role === "assistant" && cur) {
			const turnIndex = cur.turnCount;
			cur.turnCount++;
			cur.finalText = msg.content.filter((c): c is TextContent => c.type === "text").map((c) => c.text).join("");
			cur.usage = msg.usage;
			for (const c of msg.content) {
				if (c.type === "thinking") {
					const t = (c as unknown as Record<string, string>).thinking ?? "";
					cur.log.push({
						kind: "thinking",
						text: t,
						done: true,
						outcome: "complete",
						turnIndex,
						createdAt: msg.timestamp,
					});
				}
				if (c.type === "toolCall") {
					cur.toolCount++;
					cur.log.push({
						kind: "tool",
						callId: c.id,
						name: c.name,
						source: "main",
						args: c.arguments,
						result: "",
						done: false,
						turnIndex,
						createdAt: msg.timestamp,
					});
				}
			}
			if (msg.stopReason === "error" || msg.stopReason === "aborted") {
				const message = msg.errorMessage ?? `LLM ${msg.stopReason}`;
				cur.status = msg.stopReason;
				cur.termination = { kind: msg.stopReason, message };
				cur.log = finishPendingLog(cur.log, msg.stopReason, message, msg.timestamp);
			}
		} else if (msg.role === "toolResult" && cur) {
			cur.log = completeTool(
				cur.log,
				msg.toolCallId,
				extractToolText(msg),
				!msg.isError,
			);
		}
	}
	if (cur) turns.push(cur);
	return turns;
}

// #endregion

export function useAgent(
	agent: VivlosAgent,
	eventBus: EventBus,
): UseAgentResult {
	const [conversationTurns, setTurns] = useState<ConversationTurn[]>([]);
	const [loading, setLoading] = useState(false);
	const [currentSession, setCurrentSession] = useState<CurrentSessionState | null>(null);
	const [sessions, setSessions] = useState<readonly SessionMeta[]>([]);
	const [memoryOverview, setMemoryOverview] = useState<MemoryOverview | null>(null);
	const [l2Overview, setL2Overview] = useState<L2Overview | null>(null);
	const [todoList, setTodoList] = useState<TodoList | null>(null);

	// #region useAgent hook

	// ref 保存当前对话轮次在 conversation turns 数组里的索引
	const currentIdxRef = useRef(-1);
	const currentSessionRef = useRef<CurrentSessionState | null>(null);
	const consolidateRunRef = useRef(0);
	const abortRef = useRef<AbortController | null>(null);
	// 暂存 loop turn 的 usage，conversationTurn 结束时才提交
	const latestUsageRef = useRef<Usage | undefined>(undefined);
	useEffect(() => {
		const unsubs: (() => void)[] = [];
		const isCurrentSession = (sessionId: string) =>
			currentSessionRef.current?.id === sessionId;

		unsubs.push(
			eventBus.on("session:state", (event) => {
				const previous = currentSessionRef.current;
				const next: CurrentSessionState = {
					id: event.state.current.id,
					name: event.state.current.name,
					pending: event.state.current.pending,
					messageCount: event.state.current.messages.length,
				};
				const sessionChanged = previous === null || previous.id !== next.id;
				const activationChanged = previous?.pending !== next.pending;

				currentSessionRef.current = next;
				setCurrentSession(next);
				setSessions(event.state.sessions);

				if (sessionChanged) {
					const nextTodoList = agent.getTodoList();
					setTurns(messagesToTurns(event.state.current.messages));
					setLoading(false);
					setMemoryOverview(null);
					setTodoList(nextTodoList);
					currentIdxRef.current = -1;
					latestUsageRef.current = undefined;
				}
				if (sessionChanged || activationChanged) {
					eventBus.emit({
						type: "memory:overview_requested",
						sessionId: next.id,
					});
				}
			}),
		);

		unsubs.push(
			eventBus.on("memory:overview", (event) => {
				if (!isCurrentSession(event.overview.sessionId)) return;
				setMemoryOverview(event.overview);
			}),
		);

		unsubs.push(
			eventBus.on("memory:l2_overview", (event) => {
				setL2Overview(event.overview);
			}),
		);

		unsubs.push(
			eventBus.on("todo:updated", (event) => {
				if (!isCurrentSession(event.sessionId)) return;
				setTodoList(event.todoList);
			}),
		);

		// agent 开始运行
		unsubs.push(
			eventBus.on("agent:start", (event) => {
				if (!isCurrentSession(event.sessionId)) return;
				setLoading(true);
			}),
		);

		// 新的 ReAct turn 开始 -> 追加一个 thinking 条目
		unsubs.push(
			eventBus.on("agent:turn_start", (event) => {
				if (!isCurrentSession(event.sessionId)) return;
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
								createdAt: Date.now(),
							},
						],
					})),
				);
			}),
		);

		// 工具调用开始 -> 追加 tool 条目
		unsubs.push(
			eventBus.on("agent:toolCall_start", (e) => {
				if (!isCurrentSession(e.sessionId)) return;
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
								source: "main",
								args: e.args,
								result: "",
								done: false,
								turnIndex: t.turnCount,
								createdAt: Date.now(),
							},
						],
					})),
				);
			}),
		);

		// 工具调用流式结果
		unsubs.push(
			eventBus.on("agent:toolCall_delta", (e) => {
				if (!isCurrentSession(e.sessionId)) return;
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
				if (!isCurrentSession(e.sessionId)) return;
				const text = extractToolText(e.result);
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: completeTool(t.log, e.callId, text, e.success),
					})),
				);
			}),
		);

		unsubs.push(
			eventBus.on("consolidate:started", (e) => {
				if (!isCurrentSession(e.sessionId)) return;
				const callId = `consolidate-run:${++consolidateRunRef.current}`;
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: [
							...t.log,
							{
								kind: "tool",
								callId,
								name: "consolidate",
								source: "consolidator",
								result: "",
								done: false,
								runMarker: true,
								turnIndex: t.turnCount,
								createdAt: Date.now(),
							},
						],
					})),
				);
			}),
		);

		unsubs.push(
			eventBus.on("consolidate:tool_started", (e) => {
				if (!isCurrentSession(e.sessionId)) return;
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
								source: "consolidator",
								args: e.args,
								result: "",
								done: false,
								turnIndex: Math.max(0, t.turnCount - 1),
								createdAt: Date.now(),
							},
						],
					})),
				);
			}),
		);

		unsubs.push(
			eventBus.on("consolidate:tool_completed", (e) => {
				if (!isCurrentSession(e.sessionId)) return;
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: completeTool(t.log, e.callId, extractToolText(e.result), e.success),
					})),
				);
			}),
		);

		unsubs.push(
			eventBus.on("consolidate:ended", (e) => {
				if (!isCurrentSession(e.sessionId)) return;
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: completeConsolidateRun(
							t.log,
							e.error?.message ?? "",
							e.status === "completed",
						),
					})),
				);
			}),
		);

		// thinking 流式更新 -> 同时从增量 delta 消息或快照 snapshot 中提取 thinking 文本，确保 thinking 文本完整
		unsubs.push(
			eventBus.on("agent:thinking_delta", (e) => {
				if (!isCurrentSession(e.sessionId)) return;
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
			eventBus.on("agent:thinking_end", (event) => {
				if (!isCurrentSession(event.sessionId)) return;
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: updateLastThinking(t.log, (entry) => ({
							...entry,
							done: true,
							outcome: "complete",
							durationMs: Date.now() - entry.createdAt,
						})),
					})),
				);
			}),
		);

		// 文本流式更新 -> 实时写入 finalText（打字机效果） + 确保 Thinking 被正确关闭
		unsubs.push(
			eventBus.on("agent:message_delta", (e) => {
				if (!isCurrentSession(e.sessionId)) return;
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						finalText: t.finalText + e.delta,
						log: updateLastThinking(t.log, (entry) => ({
							...entry,
							done: true,
							outcome: "complete",
							durationMs: Date.now() - entry.createdAt,
						})),
					})),
				);
			}),
	);

	// loop turn 结束 -> 暂存 usage 到 ref，不触发重渲染
	unsubs.push(
		eventBus.on("agent:message_complete", (e) => {
			if (!isCurrentSession(e.sessionId)) return;
			if (e.usage) latestUsageRef.current = e.usage;
			setTurns((prev) =>
				updateCurrent(prev, currentIdxRef.current, (t) => t.status === "running"
					? {
						...t,
						log: finishPendingLog(
							t.log,
							e.outcome,
							e.errorMessage ?? "",
						),
					}
					: t),
			);
		}),
	);

	unsubs.push(
		eventBus.on("agent:retry_start", (e) => {
			if (!isCurrentSession(e.sessionId)) return;
			setTurns((prev) =>
				updateCurrent(prev, currentIdxRef.current, (t) => t.status === "running"
					? {
						...t,
						finalText: "",
						retry: {
							attempt: e.attempt,
							maxAttempts: e.maxAttempts,
							delayMs: e.delayMs,
							errorMessage: e.error.message,
						},
					}
					: t),
			);
		}),
	);

	unsubs.push(
		eventBus.on("agent:retry_end", (e) => {
			if (!isCurrentSession(e.sessionId)) return;
			setTurns((prev) =>
				updateCurrent(prev, currentIdxRef.current, (t) => ({
					...t,
					retry: undefined,
				})),
			);
		}),
	);

	// conversationTurn 结束 -> 提交最终 usage + 写入最终回复
		unsubs.push(
			eventBus.on("agent:complete", (e) => {
				if (!isCurrentSession(e.sessionId)) return;

				// setTurns 异步执行，先捕获 idx 和 usage。
				const idx = currentIdxRef.current;
				const finalUsage = latestUsageRef.current;
				setTurns((prev) =>
					updateCurrent(prev, idx, (t) => t.status === "running"
						? {
							...t,
							status: "complete" as const,
							finalText: e.finalMessage || t.finalText,
							usage: finalUsage,
							log: finishPendingLog(t.log, "complete"),
							retry: undefined,
						}
						: t),
				);
				latestUsageRef.current = undefined;
			}),
		);

		// 消费底层 Loop run 捕获的异常
		unsubs.push(
			eventBus.on("agent:error", (e) => {
				if (!isCurrentSession(e.sessionId)) return;

				if (e.kind === "error") log("error", e.error.message, e.error, true);

				const idx = currentIdxRef.current;
				setTurns((prev) =>
					updateCurrent(prev, idx, (t) => t.status === "running"
						? {
							...t,
							status: e.kind,
							termination: { kind: e.kind, message: e.error.message },
							log: finishPendingLog(t.log, e.kind, e.error.message),
							retry: undefined,
						}
						: t),
				);
			}),
		);

		eventBus.emit({ type: "session:state_requested" });
		return () => unsubs.forEach((fn) => fn());
	}, [agent, eventBus]);

	// #endregion

	// #region Callbacks
	const submit = useCallback(
		(text: string) => {
			if (!text.trim() || loading || abortRef.current) return;
			const idx = conversationTurns.length;
			currentIdxRef.current = idx; // 注意 turns 数组不能被清空，ConversationView 会渲染所有 turns，从而保留终端历史。
			setLoading(true);

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
				.catch((err) => {
					const error = err instanceof Error ? err : new Error(String(err));
					const kind = controller.signal.aborted ? "aborted" : "error";
					if (kind === "error") log("error", `fatal: ${error.message}`, error, true);
					setTurns((prev) =>
						updateCurrent(prev, idx, (t) => t.status === "running"
							? {
								...t,
								status: kind,
								termination: { kind, message: error.message },
								log: finishPendingLog(t.log, kind, error.message),
							}
							: t),
					);
				})
				.finally(() => {
					if (abortRef.current === controller) abortRef.current = null;
					if (currentIdxRef.current === idx) currentIdxRef.current = -1;
					setLoading(false);
				});
		},
		[agent, conversationTurns.length, loading],
	);

	/** 打断当前 LLM 调用 */
	const abort = useCallback(() => {
		const controller = abortRef.current;
		if (controller && !controller.signal.aborted) {
			controller.abort();
			const idx = currentIdxRef.current;
			setTurns((prev) =>
				updateCurrent(prev, idx, (t) => t.status === "running"
					? {
						...t,
						status: "aborted" as const,
						termination: { kind: "aborted", message: "用户主动中断" },
						log: finishPendingLog(t.log, "aborted", "用户主动中断"),
					}
					: t),
			);
		}
	}, []);

	/** 清空当前会话（仅清TUI，不删JSONL消息） */
	const clearConversation = useCallback(() => {
		if (loading) {
			log("warn", "Agent 运行期间不能清空当前会话", undefined, true);
			return;
		}
		setTurns([]);
		setLoading(false);
		currentIdxRef.current = -1;
	}, [loading]);

	/** 发起 session 切换；界面状态由 session:state 更新。 */
	const switchSession = useCallback((sessionId: string) => {
		if (loading) {
			log("warn", "Agent 运行期间不能切换 Session", undefined, true);
			return;
		}
		agent.switchSession(sessionId);
	}, [agent, loading]);

	/** 发起新建 session；界面状态由 session:state 更新。 */
	const newSession = useCallback(() => {
		if (loading) {
			log("warn", "Agent 运行期间不能新建 Session", undefined, true);
			return;
		}
		agent.createNewSession();
	}, [agent, loading]);
	const deleteSession = useCallback((sessionId: string) => {
		if (loading && currentSessionRef.current?.id === sessionId) {
			log("warn", "Agent 运行期间不能删除当前 Session", undefined, true);
			return;
		}
		agent.deleteSession(sessionId);
	}, [agent, loading]);
	const renameSession = useCallback((name: string) => {
		agent.renameSession(name);
	}, [agent]);
	const compact = useCallback(() => agent.compact(), [agent]);

	return {
		conversationTurns,
		loading,
		currentSession,
		sessions,
		memoryOverview,
		l2Overview,
		todoList,
		submit,
		abort,
		clearConversation,
		switchSession,
		deleteSession,
		renameSession,
		compact,
		newSession,
	};
}
