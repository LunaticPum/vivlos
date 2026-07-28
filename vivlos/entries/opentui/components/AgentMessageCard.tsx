/**
 * AgentMessageCard - Agent 消息卡片
 *
 * 推理过程两状态：
 *   compact  -> overflow=hidden height=min(n,15)，条目自底向上撑开，
 *              running 时 spinner 转，complete 时 ✓
 *   expanded -> 完整展示所有内容，无高度限制
 */

import { useState, useEffect, useRef, useCallback } from "react";
import spinners from "cli-spinners";
import { SyntaxStyle, type BorderCharacters } from "@opentui/core";
import type { ConversationTurn, LogEntry } from "../hooks/useAgent";

// #region 常量

const SPINNER = spinners.dots7;
const SPINNER_INTERVAL = 80;

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
	const duration = useReasoningDuration(conversationTurn.status);
	const isRunning = conversationTurn.status === "running";
	const isExpanded = !isRunning && detailExpanded;
	const [expandedThinkings, setExpandedThinkings] = useState<Set<number>>(
		new Set(),
	);

	const toggleThinking = useCallback((index: number) => {
		setExpandedThinkings((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	}, []);
	const bottomTitle = `${conversationTurn.turnCount} Turns · ${conversationTurn.toolCount} Tools · ${duration}s`;

	return (
		<box paddingX={3} gap={1}>
			{conversationTurn.log.length > 0 && (
				<box>
					{isExpanded ? (
						<ExpandedLog log={conversationTurn.log} bottomTitle={bottomTitle} />
					) : (
						<CompactLog
							log={conversationTurn.log}
							active={isRunning}
							expandedThinkings={expandedThinkings}
							onToggleThinking={toggleThinking}
							detailExpanded={detailExpanded}
						/>
					)}
				</box>
			)}

			{conversationTurn.status === "aborted" && (
				<text fg={C.abort}>该次对话被打断</text>
			)}
			{conversationTurn.finalText ? (
				<markdown
					content={conversationTurn.finalText}
					syntaxStyle={syntaxStyle}
					streaming={isRunning}
					conceal={!isRunning}
					fg={C.text}
				/>
			) : null}

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
type LogLines = [RenderLine, ...RenderLine[]];
type ThinkingEntry = Extract<LogEntry, { kind: "thinking" }>;
type ToolEntry = Extract<LogEntry, { kind: "tool" }>;
type RenderItem =
	| { kind: "thinking"; entry: ThinkingEntry; index: number }
	| { kind: "tool"; entries: ToolEntry[]; index: number };

/** Thinking 和 ToolGroup 都转换为 [主行, ...子文本行]。 */
function thinkingToLines(entry: ThinkingEntry, spin: string): LogLines {
	const durMs = entry.done
		? entry.durationMs ?? 0
		: Date.now() - entry.createdAt;
	const durStr = durMs > 0 ? ` ${(durMs / 1000).toFixed(1)}s` : "";
	const main: RenderLine = {
		segments: [
			{
				text: `${entry.done ? "✓ Thought" : spin + " Thinking..."}`,
				color: entry.done ? C.done : C.thinking,
			},
			...(durStr ? [{ text: durStr, color: C.toolName }] : []),
		],
	};
	if (!entry.text) return [main];
	return [
		main,
		{
			segments: [{ text: entry.text.trim(), color: C.subtext }],
			markdown: true,
			streaming: !entry.done,
		},
	];
}

function groupLogEntries(log: LogEntry[]): RenderItem[] {
	const items: RenderItem[] = [];
	for (let index = 0; index < log.length; index++) {
		const entry = log[index]!;
		if (entry.kind === "thinking") {
			items.push({ kind: "thinking", entry, index });
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

function toolGroupToLines(
	entries: ToolEntry[],
	spin: string,
	expanded: boolean,
): LogLines {
	const running = entries.some((entry) => !entry.done);
	const failed = entries.some((entry) => entry.done && entry.success === false);
	const name = entries[0]?.name ?? "tool";
	const dedicated = name === "memory" || name === "consolidate";
	const displayName = name === "memory"
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
	const main: RenderLine = {
		segments: dedicated
			? [
					{ text: `${prefix} `, color: statusColor },
					{ text: displayName, color: C.bright },
				]
			: [
					{ text: `${prefix} Calling `, color: statusColor },
					{ text: displayName, color: C.toolName },
				],
	};
	const actions: RenderLine[] = entries.flatMap((entry) => {
		if (entry.runMarker) {
			return entry.success === false && entry.result
				? [{ segments: [{ text: entry.result, color: C.subtext }] }]
				: [];
		}
		const action = formatToolAction(entry);
		return action ? [action] : [];
	});
	const visible = expanded ? actions : actions.slice(-1);
	return [main, ...visible];
}

function formatToolAction(entry: ToolEntry): RenderLine | undefined {
	const args = asRecord(entry.args);
	const action = stringValue(args?.action);
	const file = stringValue(args?.file);
	const fileName = file ? `${file}.md` : "";
	let value = "";

	if (entry.name === "memory" && action && fileName) {
		value = action === "add"
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
		return {
			segments: [
				{ text: action, color: C.bright },
				{ text: ` ${fileName} `, color: C.text },
				{ text: '"', color: C.bright },
				{ text: escapedContent(value), color: C.subtext },
				{ text: '"', color: C.bright },
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
		? value as Record<string, unknown>
		: undefined;
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function escapedContent(value: string): string {
	return JSON.stringify(value).slice(1, -1);
}

// #endregion

// #region 渲染组件

/** 子文本左竖线框。markdown 类子文本用 <markdown> 流式渲染，否则纯 <text> */
function renderSub(sub: RenderLine[], key: React.Key) {
	if (sub.length === 0) return null;
	return (
		<box
			key={key}
			border={["left"]}
			customBorderChars={textBlock}
			borderColor={C.subtext}
			paddingX={1}
		>
			{sub[0].markdown ? (
				<markdown
					content={sub[0].segments[0].text}
					syntaxStyle={syntaxStyle}
					streaming={sub[0].streaming ?? false}
					conceal={true}
					fg={C.subtext}
				/>
			) : (
				sub.map((line, j) => (
					<box key={j} flexDirection="row">
						{line.segments.map((segment, index) => (
							<text key={index} fg={segment.color}>
								{segment.text}
							</text>
						))}
					</box>
				))
			)}
		</box>
	);
}

/** compact 视图：scrollbox 最多 15 行，高度自适应 1~8 */
function CompactLog({
	log,
	active,
	expandedThinkings,
	onToggleThinking,
	detailExpanded,
}: {
	log: LogEntry[];
	active: boolean;
	expandedThinkings: Set<number>;
	onToggleThinking: (index: number) => void;
	detailExpanded: boolean;
}) {
	const spin = useSpinnerFrame(active);
	const items = groupLogEntries(log);

	return (
		<box flexDirection="column">
			{items.map((item, i) => {
				const [main, ...sub] = item.kind === "thinking"
					? thinkingToLines(item.entry, active ? spin : "✓")
					: toolGroupToLines(item.entries, active ? spin : "✓", false);
				const isThinking = item.kind === "thinking";
				const prevIsThinking = i > 0 && items[i - 1]?.kind === "thinking";
				const isTool = item.kind === "tool";
				const needSpacer = prevIsThinking && isTool;
				const isExpanded = detailExpanded || expandedThinkings.has(item.index);
				const hasSub = sub.length > 0 && sub[0].segments[0].text;
				const shouldShowSub = isThinking ? isExpanded && hasSub : hasSub;

				return (
					<box
						key={item.kind === "thinking"
							? `thinking-${item.index}`
							: `tool-${item.entries[0]!.callId}`}
						flexDirection="column"
					>
						{needSpacer && <box height={1} />}
						<box
							flexDirection="row"
							onMouseDown={
								isThinking && hasSub ? () => onToggleThinking(item.index) : undefined
							}
						>
							{main.segments.map((seg, j) => (
								<text key={j} fg={seg.color}>
									{seg.text}
								</text>
							))}
						</box>
						{shouldShowSub && renderSub(sub, `sub-${item.index}`)}
					</box>
				);
			})}
		</box>
	);
}

/** expanded 视图：完整展示，按 turn 分组 + 分隔线 */
function ExpandedLog({ log, bottomTitle }: { log: LogEntry[]; bottomTitle: string }) {
	const groups = new Map<number, LogEntry[]>();
	for (const entry of log) {
		const idx = entry.turnIndex;
		(groups.get(idx) ?? groups.set(idx, []).get(idx))!.push(entry);
	}
	return (
		<box flexDirection="column">
			{[...groups.keys()]
				.sort((a, b) => a - b)
				.map((turnIdx) => (
					<box key={turnIdx} flexDirection="column">
						<text fg={C.borderInner}>{`───── Turn ${turnIdx + 1} ─────`}</text>
						{groupLogEntries(groups.get(turnIdx)!).flatMap((item) => {
							const [main, ...sub] = item.kind === "thinking"
								? thinkingToLines(item.entry, "✓")
								: toolGroupToLines(item.entries, "✓", true);
							const key = item.kind === "thinking"
								? `thinking-${item.index}`
								: `tool-${item.entries[0]!.callId}`;
							return [
								<box key={`${turnIdx}-${key}-main`} flexDirection="row">
									{main.segments.map((seg, j) => (
										<text key={j} fg={seg.color}>
											{seg.text}
										</text>
									))}
								</box>,
								renderSub(sub, `${turnIdx}-${key}-sub`),
							];
						})}
					</box>
				))}
			<text fg={C.borderInner}>{`───── ${bottomTitle} ─────`}</text>
		</box>
	);
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
