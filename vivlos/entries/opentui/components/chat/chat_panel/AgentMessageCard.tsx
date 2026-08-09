/**
 * AgentMessageCard - Agent 消息卡片
 *
 * 时间序部件流：log 中的 thinking / text / tool 条目按发生顺序渲染，
 * 每个条目独立成块，只有当前活跃条目在流式刷新。
 * - thinking：主行可点击展开，展开内容限高可滚动
 * - text：模型文本输出，就地 markdown 渲染
 * - tool：默认单行截断，点击主行展开，展开内容限高可滚动
 * - turnIndex 变化处渲染全宽 Turn 分割线
 */

import { useState, useEffect, useRef, useCallback } from "react";
import spinners from "cli-spinners";
import { SyntaxStyle, type BorderCharacters, type ScrollBoxRenderable } from "@opentui/core";
import type { ConversationTurn, LogEntry } from "../../../hooks/useAgent";

// #region 常量

const SPINNER = spinners.dots7;
const SPINNER_INTERVAL = 80;
/** 展开内容限高（行），超出内部滚动 */
const EXPAND_HEIGHT = 8;

/** 全局 SyntaxStyle 实例，markdown 渲染用 */
const syntaxStyle = SyntaxStyle.create();

/** 颜色常量 */
const C = {
	borderOuter: "#89dceb",
	borderInner: "#94e2d5",
	text: "#cdd6f4",
	subtext: "#bac2de",
	thinking: "#eba0ac",
	tool: "#eba0ac",
	toolName: "#fab387",
	done: "#a6e3a1",
	bright: "#f5c2e7",
	dim: "#eba0ac",
	abort: "#f38ba8",
	dividerLine: "#6c7086",
} as const;

/** 子文本左竖线边框字符 */
const textBlock: BorderCharacters = {
	topLeft: "─",
	topRight: "─",
	bottomLeft: "─",
	bottomRight: "─",
	horizontal: "─",
	vertical: "┆",
	topT: "─",
	bottomT: "─",
	leftT: "┆",
	rightT: "─",
	cross: "─",
};

// #endregion

// #region Agent 消息卡片

export interface AgentMessageCardProps {
	conversationTurn: ConversationTurn;
	detailExpanded: boolean;
}

/** 推理框计时器 */
function useReasoningDuration(status: ConversationTurn["status"]): number {
	const [seconds, setSeconds] = useState(0);
	const startRef = useRef(0);
	const finalRef = useRef(0);
	useEffect(() => {
		if (status === "running") {
			startRef.current = Date.now();
			const timer = setInterval(
				() => setSeconds(Math.floor((Date.now() - startRef.current) / 1000)),
				1000,
			);
			return () => clearInterval(timer);
		}
		if (seconds > 0 && finalRef.current === 0) finalRef.current = seconds;
	}, [status]);
	return status === "running" ? seconds : finalRef.current || seconds;
}

export function AgentMessageCard({
	conversationTurn,
	detailExpanded,
}: AgentMessageCardProps) {
	// 实时计时优先；恢复的历史轮次回退到 messagesToTurns 重算的 durationMs
	const liveDuration = useReasoningDuration(conversationTurn.status);
	const duration = liveDuration > 0
		? liveDuration
		: Math.round((conversationTurn.durationMs ?? 0) / 1000);
	const isRunning = conversationTurn.status === "running";
	const [expandedThinkings, setExpandedThinkings] = useState<Set<number>>(
		new Set(),
	);
	const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

	const toggleThinking = useCallback((index: number) => {
		setExpandedThinkings((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	}, []);
	const toggleTool = useCallback((callId: string) => {
		setExpandedTools((prev) => {
			const next = new Set(prev);
			if (next.has(callId)) next.delete(callId);
			else next.add(callId);
			return next;
		});
	}, []);

	const bottomTitle = `${conversationTurn.turnCount} Turns · ${conversationTurn.toolCount} Tools · ${duration}s`;
	const items = groupLogEntries(conversationTurn.log);
	const spin = useSpinnerFrame(isRunning);

	return (
		<box paddingX={3} gap={1}>
			{items.map((item, i) => {
				const dividerTurn = dividerBefore(items, i);
				return (
					<box key={`part-${i}`} flexDirection="column">
						{dividerTurn !== null && <TurnDivider turn={dividerTurn} />}
						{renderItem({
							item,
							spin: isRunning ? spin : "✓",
							active: isRunning,
							expanded: detailExpanded,
							expandedThinkings,
							expandedTools,
							onToggleThinking: toggleThinking,
							onToggleTool: toggleTool,
						})}
					</box>
				);
			})}

			{conversationTurn.termination && (
				<text fg={C.abort}>
					{`对话终止：${conversationTurn.termination.message}`}
				</text>
			)}
			{conversationTurn.retry && (
				<text fg={C.toolName}>
					{`正在重试 ${conversationTurn.retry.attempt}/${conversationTurn.retry.maxAttempts}，${Math.ceil(conversationTurn.retry.delayMs / 1000)} 秒后继续`}
				</text>
			)}
			{detailExpanded && !isRunning && conversationTurn.log.length > 0 && (
				<box width="100%" flexDirection="row">
					<box flexGrow={1} height={1} border={["top"]} borderColor={C.dividerLine} />
					<text fg={C.bright}>{` ${bottomTitle} `}</text>
					<box flexGrow={1} height={1} border={["top"]} borderColor={C.dividerLine} />
				</box>
			)}
		</box>
	);
}

// #endregion

// #region 数据模型

interface RenderSegment {
	text: string;
	color: string;
}
interface RenderLine {
	segments: RenderSegment[];
	markdown?: boolean;
	streaming?: boolean;
}
type ThinkingEntry = Extract<LogEntry, { kind: "thinking" }>;
type ToolEntry = Extract<LogEntry, { kind: "tool" }>;
type TextEntry = Extract<LogEntry, { kind: "text" }>;
type RenderItem =
	| { kind: "thinking"; entry: ThinkingEntry; index: number }
	| { kind: "tool"; entries: ToolEntry[]; index: number }
	| { kind: "text"; entry: TextEntry; index: number };

function groupLogEntries(log: LogEntry[]): RenderItem[] {
	const items: RenderItem[] = [];
	for (let index = 0; index < log.length; index++) {
		const entry = log[index]!;
		if (entry.kind === "thinking") {
			items.push({ kind: "thinking", entry, index });
			continue;
		}
		if (entry.kind === "text") {
			items.push({ kind: "text", entry, index });
			continue;
		}
		const previous = items.at(-1);
		if (
			previous?.kind === "tool" &&
			previous.entries[0]?.source === entry.source &&
			previous.entries[0]?.name === entry.name
		) {
			previous.entries.push(entry);
			continue;
		}
		items.push({ kind: "tool", entries: [entry], index });
	}
	return items;
}

/** 第 i 个部件前是否需要 Turn 分割线；返回 Turn 编号（1 起），不需要返回 null。 */
function dividerBefore(items: RenderItem[], i: number): number | null {
	const current = firstTurnIndex(items[i]!);
	if (current === null) return null;
	// 第一个部件前也显示 Turn 1 分割线
	if (i === 0) return current + 1;
	const previous = lastTurnIndex(items[i - 1]!);
	if (previous === null || current === previous) return null;
	return current + 1;
}

function firstTurnIndex(item: RenderItem): number | null {
	return item.kind === "tool"
		? (item.entries[0]?.turnIndex ?? null)
		: item.entry.turnIndex;
}

function lastTurnIndex(item: RenderItem): number | null {
	return item.kind === "tool"
		? (item.entries.at(-1)?.turnIndex ?? null)
		: item.entry.turnIndex;
}

// #endregion

// #region 部件渲染

interface RenderCtx {
	spin: string;
	active: boolean;
	expanded: boolean;
	expandedThinkings: Set<number>;
	expandedTools: Set<string>;
	onToggleThinking: (index: number) => void;
	onToggleTool: (callId: string) => void;
}

function renderItem({
	item,
	spin,
	active,
	expanded,
	expandedThinkings,
	expandedTools,
	onToggleThinking,
	onToggleTool,
}: RenderCtx & { item: RenderItem }) {
	if (item.kind === "text") {
		return (
			<markdown
				content={item.entry.text}
				syntaxStyle={syntaxStyle}
				streaming={!item.entry.done && active}
				conceal={item.entry.done || !active}
				fg={C.text}
			/>
		);
	}
	if (item.kind === "thinking") {
		const entry = item.entry;
		const [main] = thinkingToLines(entry, spin);
		const hasSub = entry.text.trim().length > 0;
		const isExpanded = expanded || expandedThinkings.has(item.index);
		return (
			<box flexDirection="column">
				<box
					flexDirection="row"
					onMouseDown={hasSub ? () => onToggleThinking(item.index) : undefined}
				>
					{main!.segments.map((seg, j) => (
						<text key={j} fg={seg.color}>
							{seg.text}
						</text>
					))}
				</box>
				{isExpanded && hasSub &&
					(countTextLines(entry.text) <= EXPAND_HEIGHT
						? <ThinkingDetail entry={entry} active={active} />
						: (
							<FixedScrollBox sticky={!entry.done && active}>
								<ThinkingDetail entry={entry} active={active} />
							</FixedScrollBox>
						))}
			</box>
		);
	}
	// tool
	const entries = item.entries;
	const callId = entries[0]!.callId;
	const main = toolMainLine(entries, spin);
	const detail = toolDetailLines(entries);
	// /detail 只展开 thinking；tool 仅响应单独点击展开
	const isExpanded = expandedTools.has(callId);
	return (
		<box flexDirection="column">
			<box flexDirection="row" onMouseDown={() => onToggleTool(callId)}>
				{main.segments.map((seg, j) => (
					<text key={j} fg={seg.color}>
						{seg.text}
					</text>
				))}
			</box>
			{!isExpanded && detail.length > 0 && (
				<box paddingLeft={2}>
					<text width="100%" height={1} wrapMode="none" truncate fg={C.subtext}>
						{detail[0]!.segments.map((seg) => seg.text).join("")}
					</text>
				</box>
			)}
			{isExpanded && detail.length > 0 &&
				(countDetailLines(detail) <= EXPAND_HEIGHT
					? <ToolDetail detail={detail} />
					: (
						<FixedScrollBox>
							<ToolDetail detail={detail} />
						</FixedScrollBox>
					))}
		</box>
	);
}

/** 全宽 Turn 分割线：──── Turn N ────（border 拼法，自适应终端宽度） */
function TurnDivider({ turn }: { turn: number }) {
	return (
		<box width="100%" flexDirection="row" marginBottom={1}>
			<box flexGrow={1} height={1} border={["top"]} borderColor={C.dividerLine} />
			<text fg={C.bright}>{` Turn ${turn} `}</text>
			<box flexGrow={1} height={1} border={["top"]} borderColor={C.dividerLine} />
		</box>
	);
}

/** thinking 展开明细：左竖线框 + markdown 内容 */
function ThinkingDetail({
	entry,
	active,
}: {
	entry: ThinkingEntry;
	active: boolean;
}) {
	return (
		<box
			border={["left"]}
			customBorderChars={textBlock}
			borderColor={C.subtext}
			paddingX={1}
		>
			<markdown
				content={entry.text.trim()}
				syntaxStyle={syntaxStyle}
				streaming={!entry.done && active}
				conceal={true}
				fg={C.subtext}
			/>
		</box>
	);
}

/** tool 展开明细：左竖线框 + 纯文本行 */
function ToolDetail({ detail }: { detail: RenderLine[] }) {
	return (
		<box
			border={["left"]}
			customBorderChars={textBlock}
			borderColor={C.subtext}
			paddingX={1}
			flexDirection="column"
		>
			{detail.map((line, j) => (
				<text key={j} fg={C.subtext}>
					{line.segments.map((seg) => seg.text).join("")}
				</text>
			))}
		</box>
	);
}

/** 文本行数（按换行拆分） */
function countTextLines(text: string): number {
	return text.trim().split("\n").length;
}

/** 明细行总数（含每行文本内部的换行） */
function countDetailLines(detail: RenderLine[]): number {
	return detail.reduce((sum, line) => {
		const text = line.segments.map((seg) => seg.text).join("");
		return sum + text.split("\n").length;
	}, 0);
}

/**
 * 固定高度只读滚动框：仅在展开内容确定超出 EXPAND_HEIGHT 时使用，
 * 内容必然填满视口，不会出现空行占用。
 * - sticky=true 时跟随底部（流式 thinking 持续增长时始终看到最新内容）
 * - 禁用聚焦避免抢走输入框焦点
 * - 内容可滚动时拦截滚轮事件，避免冒泡到外层聊天滚动区
 */
function FixedScrollBox({
	children,
	sticky,
}: {
	children: React.ReactNode;
	sticky?: boolean;
}) {
	const ref = useRef<ScrollBoxRenderable>(null);
	useEffect(() => {
		if (ref.current) ref.current.focusable = false;
	}, []);
	return (
		<scrollbox
			ref={ref}
			height={EXPAND_HEIGHT}
			stickyScroll={sticky ?? false}
			stickyStart={sticky ? "bottom" : undefined}
			verticalScrollbarOptions={{ visible: false }}
			onMouseScroll={(event) => {
				const sb = ref.current;
				if (sb && sb.scrollHeight > sb.height) event.stopPropagation();
			}}
		>
			{children}
		</scrollbox>
	);
}

// #endregion

// #region 行构造

function thinkingToLines(entry: ThinkingEntry, spin: string): [RenderLine] {
	const failed = entry.done &&
		(entry.outcome === "error" || entry.outcome === "aborted");
	const durMs = entry.done
		? (entry.durationMs ?? 0)
		: Date.now() - entry.createdAt;
	const durStr = durMs > 0 ? ` ${(durMs / 1000).toFixed(1)}s` : "";
	return [{
		segments: [
			{
				text: failed
					? "✗ Thought"
					: entry.done
						? "✓ Thought"
						: `${spin} Thinking...`,
				color: failed ? C.abort : entry.done ? C.done : C.thinking,
			},
			...(durStr ? [{ text: durStr, color: C.toolName }] : []),
		],
	}];
}

function toolMainLine(entries: ToolEntry[], spin: string): RenderLine {
	const running = entries.some((entry) => !entry.done);
	const failed = entries.some((entry) => entry.done && entry.success === false);
	const name = entries[0]?.name ?? "tool";
	const dedicated = name === "memory" || name === "consolidate";
	const displayName =
		name === "memory"
			? "Memory"
			: name === "consolidate"
				? "Consolidate"
				: name;
	const prefix = running ? spin : failed ? "✗" : "✓";
	const statusColor = failed
		? C.abort
		: dedicated
			? C.bright
			: running
				? C.tool
				: C.done;
	// 耗时：运行中取首个条目至今，完成后取末条 durationMs
	const last = entries[entries.length - 1]!;
	const durMs = running
		? Date.now() - entries[0]!.createdAt
		: (last.durationMs ?? 0);
	const durStr = durMs > 0 ? ` ${(durMs / 1000).toFixed(1)}s` : "";
	const head = dedicated
		? [
			{ text: `${prefix} `, color: statusColor },
			{ text: displayName, color: C.bright },
		]
		: [
			{ text: `${prefix} Calling `, color: statusColor },
			{ text: displayName, color: C.toolName },
		];
	return {
		segments: durStr ? [...head, { text: durStr, color: C.toolName }] : head,
	};
}

/** 工具明细行：参数摘要 / 结果。折叠态取首行截断，展开态全部显示。 */
function toolDetailLines(entries: ToolEntry[]): RenderLine[] {
	return entries.flatMap((entry) => {
		if (entry.runMarker) {
			return entry.success === false && entry.result
				? [{ segments: [{ text: entry.result, color: C.subtext }] }]
				: [];
		}
		const action = formatToolAction(entry);
		return action ? [action] : [];
	});
}

function formatToolAction(entry: ToolEntry): RenderLine | undefined {
	const args = asRecord(entry.args);
	const action = stringValue(args?.action);
	const file = stringValue(args?.file);
	const fileName = file ? `${file}.md` : "";
	let value = "";

	if (entry.name === "memory" && action && fileName) {
		value =
			action === "add"
				? stringValue(args?.content)
				: action === "replace"
					? stringValue(args?.new_text)
					: action === "remove"
						? stringValue(args?.old_text)
						: "";
	}
	if (entry.name === "consolidate" && action && fileName) {
		value = stringValue(args?.new_entry);
	}
	if (action && fileName && value) {
		const accent = entry.name === "memory" ? C.thinking : C.bright;
		return {
			segments: [
				{ text: action, color: accent },
				{ text: ` ${fileName} `, color: C.text },
				{ text: '"', color: accent },
				{ text: escapedContent(value), color: C.subtext },
				{ text: '"', color: accent },
				...(entry.success === false && entry.result
					? [{ text: `: ${entry.result}`, color: C.subtext }]
					: []),
			],
		};
	}
	return entry.result.trim()
		? { segments: [{ text: entry.result.trim(), color: C.subtext }] }
		: undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function escapedContent(value: string): string {
	return JSON.stringify(value).slice(1, -1);
}

// #endregion

// #region 工具函数

/** spinner 纯文本帧 */
function useSpinnerFrame(active: boolean): string {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(
			() => setFrame((f) => (f + 1) % SPINNER.frames.length),
			SPINNER_INTERVAL,
		);
		return () => clearInterval(timer);
	}, [active]);
	return SPINNER.frames[frame]!;
}

// #endregion
