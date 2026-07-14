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

/**
 * 将一条 LogEntry 转为渲染项。
 * 返回 [主行, ...子文本行]。主行是 "✓ Thinking..." / "✓ Calling xxx"，
 * 子文本行用 markdown 或纯文本渲染。
 */
function entryToLines(entry: LogEntry, spin: string): LogLines {
	if (entry.kind === "thinking") {
		const durMs = entry.done
			? entry.durationMs ?? 0
			: Date.now() - entry.createdAt;
		const durStr =
			durMs > 0 ? ` ${(durMs / 1000).toFixed(1)}s` : "";
		const main: RenderLine = {
			segments: [
				{
					text: `${entry.done ? "✓ Thought" : spin + " Thinking..."}`,
					color: entry.done ? C.done : C.thinking,
				},
				...(durStr
					? [{ text: durStr, color: C.toolName }]
					: []),
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
	// tool
	const prefix = entry.done ? "✓" : spin;
	const main: RenderLine = {
		segments: [
			{ text: `${prefix} Calling `, color: entry.done ? C.done : C.tool },
			{ text: entry.name, color: C.toolName },
		],
	};
	if (!entry.result) return [main];
	return [main, { segments: [{ text: entry.result, color: C.subtext }] }];
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
					<text key={j} fg={C.subtext}>
						{line.segments[0].text}
					</text>
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
	const entries = log.map((entry) => entryToLines(entry, active ? spin : "✓"));

	return (
		<box flexDirection="column">
			{entries.map(([main, ...sub], i) => {
				const isThinking = log[i].kind === "thinking";
				const prevIsThinking = i > 0 && log[i - 1].kind === "thinking";
				const isTool = log[i].kind === "tool";
				const needSpacer = prevIsThinking && isTool;
				const isExpanded = detailExpanded || expandedThinkings.has(i);
				const hasSub = sub.length > 0 && sub[0].segments[0].text;
				const shouldShowSub = isThinking ? isExpanded && hasSub : hasSub;

				return (
					<box key={i} flexDirection="column">
						{needSpacer && <box height={1} />}
						<box
							flexDirection="row"
							onMouseDown={
								isThinking && hasSub ? () => onToggleThinking(i) : undefined
							}
						>
							{main.segments.map((seg, j) => (
								<text key={j} fg={seg.color}>
									{seg.text}
								</text>
							))}
						</box>
						{shouldShowSub && renderSub(sub, `sub-${i}`)}
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
						{groups.get(turnIdx)!.flatMap((entry) => {
							const [main, ...sub] = entryToLines(entry, "✓");
							return [
								<box key={`${turnIdx}-main`} flexDirection="row">
									{main.segments.map((seg, j) => (
										<text key={j} fg={seg.color}>
											{seg.text}
										</text>
									))}
								</box>,
								renderSub(sub, `${turnIdx}-sub`),
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
