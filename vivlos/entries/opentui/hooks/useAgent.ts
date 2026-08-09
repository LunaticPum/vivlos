/**
 * useAgent - EventBus -> React state 桥接 hook
 *
 * 订阅 agent 生命周期事件，输出纯 state 供组件渲染。
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type {
	Usage,
	Message,
	TextContent,
	Model,
	Api,
	UserMessage,
} from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { EventBus, TodoList } from "@vivlos/infra/eventbus/index.ts";
import type { MemoryOverview } from "@vivlos/infra/storage/memory/index.ts";
import type { L2Overview } from "@vivlos/infra/storage/memory/index.ts";
import type { SessionMeta } from "@vivlos/infra/storage/session/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { LLMConfigRepository } from "@vivlos/infra/storage/index.ts";
import type { ImageAttachment } from "@vivlos/shared/utils/image.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import {
	parseDelegationXml,
	renderDelegationXml,
} from "@vivlos/agent/delegation/xml.ts";
import type { DelegationBatchState } from "@vivlos/agent/delegation/types.ts";
import { buildBriefUserMessage } from "@vivlos/agent/delegation/prompts.ts";
import { log } from "@vivlos/infra/logger/logger.ts";

// #region 类型

/**
 * 推理过程日志条目（thinking / tool / text），按事件顺序追加。
 * text 条目保存 thinking 之后、工具调用之间的模型文本输出，
 * 与 thinking/tool 交替构成时间序部件流。
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
			/**
			 * 工具结构化细节（如 delegate 的批次状态）。
			 * 运行时来自 onUpdate/toolResult 的 details；
			 * 历史重建时由 messagesToTurns 从结果文本解析。
			 */
			details?: unknown;
			turnIndex: number;
			createdAt: number;
			durationMs?: number;
	  }
	| {
			kind: "text";
			text: string;
			done: boolean;
			turnIndex: number;
			createdAt: number;
	  };

/**
 * 一轮对话中 tui 能用到并展示的所有信息，注意 Conversation Turn ≠ ReAct turn，需要区分
 */
export interface ConversationTurn {
	userInput: string;
	/** 本轮附带的图片文件名（用于渲染占位） */
	attachedImages?: readonly string[];
	log: LogEntry[];
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
	/**
	 * 整轮墙钟耗时（毫秒）。
	 * 恢复的历史轮次由 messagesToTurns 用消息时间戳重算；
	 * 运行中的轮次由界面实时计时，不依赖此字段。
	 */
	durationMs?: number;
}

export interface CurrentSessionState {
	readonly id: string;
	readonly name: string | null;
	readonly pending: boolean;
	readonly messageCount: number;
}

/** 钻取视图用的子 agent 会话快照（内存态，随主会话生命周期）。 */
export interface DelegationSessionView {
	readonly kind: "exploring" | "writing";
	readonly title: string;
	readonly messages: readonly Message[];
	readonly running: boolean;
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
	/** 当前 Session 内各委派子任务的会话快照（钻取视图数据源）。 */
	delegationSessions: Readonly<Record<string, DelegationSessionView>>;
	submit: (text: string, attachments?: readonly ImageAttachment[]) => void;
	abort: () => void;
	clearConversation: () => void;
	switchSession: (sessionId: string) => void;
	deleteSession: (sessionId: string) => void;
	renameSession: (name: string) => void;
	compact: VivlosAgent["compact"];
	/** 创建新 session 并重置 TUI */
	newSession: () => void;
	/** /delegate-demo：模拟委派全流程（样式原型） */
	delegateDemo: () => void;
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

/** 从 tool result/partialResult 中提取结构化 details（如 delegate 批次状态）。 */
function extractToolDetails(raw: unknown): unknown {
	if (!raw || typeof raw !== "object") return undefined;
	return (raw as Record<string, unknown>).details;
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
		if (entry.kind === "text" && !entry.done) {
			return { ...entry, done: true };
		}
		if (outcome !== "complete" && entry.kind === "tool" && !entry.done) {
			return { ...entry, done: true, success: false, result: reason };
		}
		return entry;
	});
}

/** 文本增量追加：末尾是未完成 text 条目则追加，否则新建条目。 */
function appendTextDelta(
	log: LogEntry[],
	delta: string,
	turnIndex: number,
): LogEntry[] {
	const last = log[log.length - 1];
	if (last && last.kind === "text" && !last.done) {
		return [...log.slice(0, -1), { ...last, text: last.text + delta }];
	}
	return [
		...log,
		{ kind: "text", text: delta, done: false, turnIndex, createdAt: Date.now() },
	];
}

/** 封闭所有未完成的 text 条目（新 turn / 工具调用开始时调用）。 */
function sealTextEntries(log: LogEntry[]): LogEntry[] {
	return log.map((entry) =>
		entry.kind === "text" && !entry.done ? { ...entry, done: true } : entry,
	);
}

/** 丢弃末尾连续的 text 条目（重试时丢弃失败尝试的半截文本）。 */
function dropTrailingText(log: LogEntry[]): LogEntry[] {
	let end = log.length;
	while (end > 0 && log[end - 1]!.kind === "text") end--;
	return end === log.length ? log : log.slice(0, end);
}

function completeTool(
	log: LogEntry[],
	callId: string,
	result: string,
	success: boolean,
	details?: unknown,
	completedAt = Date.now(),
): LogEntry[] {
	return log.map((entry) =>
		entry.kind === "tool" && entry.callId === callId
			? {
				...entry,
				result,
				success,
				done: true,
				...(details !== undefined ? { details } : {}),
				durationMs: Math.max(0, completedAt - entry.createdAt),
			}
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
export function messagesToTurns(messages: readonly Message[]): ConversationTurn[] {
	const turns: ConversationTurn[] = [];
	let cur: ConversationTurn | null = null;
	// 整轮耗时重算：本轮 user 消息时间戳与最后一条消息时间戳
	let turnStartTs = 0;
	let turnLastTs = 0;

	for (const msg of messages) {
		if (msg.role === "user") {
			const text = typeof msg.content === "string"
				? msg.content
				: msg.content.filter((c): c is TextContent => c.type === "text").map((c) => c.text).join("");
		if (cur) {
			cur.durationMs = Math.max(0, turnLastTs - turnStartTs);
			turns.push(cur);
		}
			cur = { userInput: text, log: [], status: "complete", turnCount: 0, toolCount: 0 };
			turnStartTs = msg.timestamp;
			turnLastTs = msg.timestamp;
		} else if (msg.role === "assistant" && cur) {
			turnLastTs = msg.timestamp;
			const turnIndex = cur.turnCount;
			cur.turnCount++;
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
				if (c.type === "text") {
					const text = (c as TextContent).text;
					if (text) {
						cur.log.push({
							kind: "text",
							text,
							done: true,
							turnIndex,
							createdAt: msg.timestamp,
						});
					}
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
			turnLastTs = msg.timestamp;
			const text = extractToolText(msg);
			const entry = cur.log.find(
				(e) => e.kind === "tool" && e.callId === msg.toolCallId,
			);
			// delegate 的历史重建：从结果 XML 解析批次终态
			const details = entry?.kind === "tool" && entry.name === "delegate"
				? parseDelegationXml(text) ?? undefined
				: undefined;
			cur.log = completeTool(
				cur.log,
				msg.toolCallId,
				text,
				!msg.isError,
				details,
				msg.timestamp,
			);
		}
	}
	if (cur) {
		cur.durationMs = Math.max(0, turnLastTs - turnStartTs);
		turns.push(cur);
	}
	return turns;
}

// #endregion

// #region 视觉模型解析

type VisionResolution =
	| { ok: true; model: Model<Api> }
	| { ok: false; message: string };

/**
 * 图片轮次的模型解析链：
 * 已指定视觉模型且可解析 → 用它；否则主模型支持图片 → 用主模型；
 * 都不满足 → 失败并给出通知文案。
 */
function resolveVisionModel(deps: UseAgentLlmDeps): VisionResolution {
	const visionEntry = deps.llmConfigRepo.loadVisionModel();
	if (visionEntry) {
		const [provider, modelId] = visionEntry.split("/");
		const model = provider && modelId
			? deps.llm.getModel(provider, modelId)
			: undefined;
		if (model && model.input.includes("image")) {
			return { ok: true, model };
		}
	}
	const mainModel = deps.llm.getModel(
		deps.llm.getDefaultProvider(),
		deps.llm.getDefaultModelId(),
	);
	if (mainModel?.input.includes("image")) {
		return { ok: true, model: mainModel };
	}
	return {
		ok: false,
		message:
			"当前主模型不支持图片识别，请在模型选择弹窗（Ctrl+L）按 g 指定视觉模型",
	};
}

// #endregion

export interface UseAgentLlmDeps {
	/** LLM 客户端（用于图片轮次解析视觉模型） */
	readonly llm: LLMClient;
	/** LLM 配置仓储（读取已指定的视觉模型） */
	readonly llmConfigRepo: LLMConfigRepository;
}

export function useAgent(
	agent: VivlosAgent,
	eventBus: EventBus,
	llmDeps?: UseAgentLlmDeps,
): UseAgentResult {
	const [conversationTurns, setTurns] = useState<ConversationTurn[]>([]);
	const [loading, setLoading] = useState(false);
	const [currentSession, setCurrentSession] = useState<CurrentSessionState | null>(null);
	const [sessions, setSessions] = useState<readonly SessionMeta[]>([]);
	const [memoryOverview, setMemoryOverview] = useState<MemoryOverview | null>(null);
	const [l2Overview, setL2Overview] = useState<L2Overview | null>(null);
	const [todoList, setTodoList] = useState<TodoList | null>(null);
	const [delegationSessions, setDelegationSessions] = useState<
		Record<string, DelegationSessionView>
	>({});

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
					setDelegationSessions({});
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

		// 委派子会话消息快照（钻取视图）
		unsubs.push(
			eventBus.on("delegation:task_messages", (event) => {
				if (!isCurrentSession(event.sessionId)) return;
				setDelegationSessions((prev) => ({
					...prev,
					[event.taskId]: {
						kind: event.kind,
						title: event.title,
						messages: event.messages,
						running: event.running,
					},
				}));
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
							...sealTextEntries(t.log),
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
							...sealTextEntries(t.log),
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
				const details = extractToolDetails(e.partialResult);
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: t.log.map((entry) =>
							entry.kind === "tool" && entry.callId === e.callId
								? {
									...entry,
									result: text,
									...(details !== undefined ? { details } : {}),
								}
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
				const details = extractToolDetails(e.result);
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: completeTool(t.log, e.callId, text, e.success, details),
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

		// 文本流式更新 -> 按时间序追加 text 条目 + 确保 Thinking 被正确关闭
		unsubs.push(
			eventBus.on("agent:message_delta", (e) => {
				if (!isCurrentSession(e.sessionId)) return;
				setTurns((prev) =>
					updateCurrent(prev, currentIdxRef.current, (t) => ({
						...t,
						log: appendTextDelta(
							updateLastThinking(t.log, (entry) => ({
								...entry,
								done: true,
								outcome: "complete",
								durationMs: Date.now() - entry.createdAt,
							})),
							e.delta,
							Math.max(0, t.turnCount - 1),
						),
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
							log: dropTrailingText(t.log),
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

	// conversationTurn 结束 -> 提交最终 usage + 封闭日志
		unsubs.push(
			eventBus.on("agent:complete", (e) => {
				if (!isCurrentSession(e.sessionId)) return;

				// setTurns 异步执行，先捕获 idx 和 usage。
				const idx = currentIdxRef.current;
				const finalUsage = latestUsageRef.current;
				setTurns((prev) =>
					updateCurrent(prev, idx, (t) => {
						if (t.status !== "running") return t;
						let log = finishPendingLog(t.log, "complete");
						// 兜底：流式 delta 缺失时用 finalMessage 补一条 text 条目
						if (e.finalMessage && !log.some((entry) => entry.kind === "text")) {
							log = [
								...log,
								{
									kind: "text",
									text: e.finalMessage,
									done: true,
									turnIndex: Math.max(0, t.turnCount - 1),
									createdAt: Date.now(),
								},
							];
						}
						return {
							...t,
							status: "complete" as const,
							usage: finalUsage,
							log,
							retry: undefined,
						};
					}),
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
		(text: string, attachments?: readonly ImageAttachment[]) => {
			const hasAttachments = (attachments?.length ?? 0) > 0;
			if ((!text.trim() && !hasAttachments) || loading || abortRef.current) return;

			// ── 图片轮次：解析视觉模型 ──
			let input: string | AgentMessage[] = text;
			let modelOverride: Model<Api> | undefined;
			if (hasAttachments && llmDeps) {
				const resolved = resolveVisionModel(llmDeps);
				if (!resolved.ok) {
					log("warn", resolved.message, undefined, true);
					return;
				}
				modelOverride = resolved.model;
				const content: UserMessage["content"] = [];
				if (text.trim()) content.push({ type: "text", text: text.trim() });
				for (const attachment of attachments!) {
					content.push({
						type: "image",
						data: attachment.data,
						mimeType: attachment.mimeType,
					});
				}
				input = [{ role: "user", content, timestamp: Date.now() }];
			} else if (hasAttachments) {
				log("warn", "图片功能未就绪（LLM 依赖缺失）", undefined, true);
				return;
			}

			const idx = conversationTurns.length;
			currentIdxRef.current = idx; // 注意 turns 数组不能被清空，ConversationView 会渲染所有 turns，从而保留终端历史。
			setLoading(true);

			setTurns((prev) => [
				...prev,
				{
					userInput: text,
					...(hasAttachments
						? { attachedImages: attachments!.map((a) => a.name) }
						: {}),
					log: [],
					status: "running",
					turnCount: 0,
					toolCount: 0,
				},
			]);

			// 每次提交创建新的 AbortController
			const controller = new AbortController();
			abortRef.current = controller;

			agent
				.prompt(input, controller.signal, modelOverride)
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
		[agent, conversationTurns.length, loading, llmDeps],
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
		setDelegationSessions({});
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

	// #endregion

	// #region 委派样式原型（/delegate-demo）

	/**
	 * 模拟一次完整委派流程：走真实事件管道（toolCall_start/delta/end），
	 * 驱动与真实 delegate tool 完全相同的渲染链路，仅用于样式打样。
	 */
	const delegateDemoRunning = useRef(false);
	const delegateDemo = useCallback(() => {
		const sessionId = currentSessionRef.current?.id;
		if (!sessionId || loading || delegateDemoRunning.current) return;
		delegateDemoRunning.current = true;

		const idx = conversationTurns.length;
		currentIdxRef.current = idx;
		setTurns((prev) => [
			...prev,
			{
				userInput: "▸ 委派演示（模拟数据，非真实执行）",
				log: [],
				status: "complete" as const,
				turnCount: 0,
				toolCount: 1,
			},
		]);

		const callId = `demo-delegate-${Date.now()}`;
		const batch: DelegationBatchState = {
			phase: "running",
			tasks: [
				{
					id: "t1",
					kind: "exploring",
					title: "定位会话存储实现",
					state: "running",
					startedAt: Date.now(),
					turns: 0,
				},
				{
					id: "t2",
					kind: "writing",
					title: "为 bash 工具增加超时保护",
					state: "running",
					startedAt: Date.now(),
					turns: 0,
				},
			],
		};
		const [t1, t2] = batch.tasks as [
			DelegationBatchState["tasks"][number],
			DelegationBatchState["tasks"][number],
		];

		// 子会话消息快照（钻取视图演示）
		const brief0: Message[] = [
			buildBriefUserMessage({
				kind: "exploring",
				title: t1.title,
				brief: "（演示：定位会话存储的实现位置并返回 file:line 证据）",
			}),
		];
		const brief1: Message[] = [
			buildBriefUserMessage({
				kind: "writing",
				title: t2.title,
				brief: "（演示：为 bash 工具增加超时保护并验证）",
			}),
		];
		const emitMsg = (
			index: number,
			msgs: Message[],
			running: boolean,
		) => {
			const task = index === 0 ? t1 : t2;
			eventBus.emit({
				type: "delegation:task_messages",
				sessionId,
				taskId: `${callId}:${task.id}`,
				kind: task.kind,
				title: task.title,
				messages: msgs,
				running,
			});
		};
		const demoAssistant = (text: string): Message =>
			({
				role: "assistant",
				content: [{ type: "text", text }],
				timestamp: Date.now(),
				stopReason: "stop",
			}) as Message;
		brief0.forEach((_, i) => emitMsg(0, brief0, true));
		emitMsg(1, brief1, true);

		const snapshot = (): DelegationBatchState => ({
			phase: batch.phase,
			tasks: batch.tasks.map((task) => ({ ...task })),
		});
		const delta = () =>
			eventBus.emit({
				type: "agent:toolCall_delta",
				sessionId,
				callId,
				partialResult: { content: [], details: snapshot() },
			});

		eventBus.emit({
			type: "agent:toolCall_start",
			sessionId,
			toolName: "delegate",
			callId,
			args: {
				tasks: [
					{ kind: "exploring", title: t1.title, brief: "（演示）" },
					{ kind: "writing", title: t2.title, brief: "（演示）" },
				],
			},
		});

		const timers: ReturnType<typeof setTimeout>[] = [];
		const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

		at(600, delta);
		at(1400, () => {
			t1.turns = 2;
			t1.currentTool = "grep";
			t2.turns = 1;
			t2.currentTool = "read";
			delta();
			const msgs0 = [...brief0, demoAssistant("用 grep 搜索 jsonl-repo 的引用...")];
			const msgs1 = [...brief1, demoAssistant("先阅读 bash 工具的当前实现...")];
			emitMsg(0, msgs0, true);
			emitMsg(1, msgs1, true);
		});
		at(2200, () => {
			t1.turns = 5;
			t1.currentTool = "read";
			t2.turns = 3;
			t2.currentTool = "bash";
			delta();
			const msgs0 = [
				...brief0,
				demoAssistant("用 grep 搜索 jsonl-repo 的引用..."),
				demoAssistant("找到目标文件，正在阅读实现细节..."),
			];
			emitMsg(0, msgs0, true);
		});
		at(3000, () => {
			t1.state = "completed";
			t1.completedAt = Date.now();
			t1.currentTool = undefined;
			t1.result =
				"结论：会话持久化位于 vivlos/infra/storage/session/jsonl-repo.ts:41\n- appendMessage() L70：appendFileSync 写入 history.jsonl\n- ensureSession() L49：首次 activate 时延迟写入 header";
			t2.turns = 6;
			t2.currentTool = "write";
			delta();
			const msgs0 = [
				...brief0,
				demoAssistant("用 grep 搜索 jsonl-repo 的引用..."),
				demoAssistant("找到目标文件，正在阅读实现细节..."),
				demoAssistant(
					"结论：会话持久化位于 vivlos/infra/storage/session/jsonl-repo.ts:41\n- appendMessage() L70：appendFileSync 写入 history.jsonl\n- ensureSession() L49：首次 activate 时延迟写入 header",
				),
			];
			emitMsg(0, msgs0, false);
		});
		at(4000, () => {
			t2.state = "completed";
			t2.completedAt = Date.now();
			t2.currentTool = undefined;
			t2.result =
				"改动清单：\n- vivlos/agent/tools/builtin/bash.ts：新增 120s 默认超时参数\n验证方式与结果：bun run test 全部通过";
			delta();
			const msgs1 = [
				...brief1,
				demoAssistant("先阅读 bash 工具的当前实现..."),
				demoAssistant("新增超时参数，修改调用点..."),
				demoAssistant(
					"改动清单：\n- vivlos/agent/tools/builtin/bash.ts：新增 120s 默认超时参数\n验证方式与结果：bun run test 全部通过",
				),
			];
			emitMsg(1, msgs1, false);
		});
		at(4300, () => {
			batch.phase = "done";
			eventBus.emit({
				type: "agent:toolCall_end",
				sessionId,
				callId,
				result: {
					content: [{ type: "text", text: renderDelegationXml(snapshot()) }],
					details: snapshot(),
				},
				success: true,
			});
			delegateDemoRunning.current = false;
		});
	}, [conversationTurns.length, loading, eventBus]);

	// #endregion

	return {
		conversationTurns,
		loading,
		currentSession,
		sessions,
		memoryOverview,
		l2Overview,
		todoList,
		delegationSessions,
		submit,
		abort,
		clearConversation,
		switchSession,
		deleteSession,
		renameSession,
		compact,
		newSession,
		delegateDemo,
	};
}
