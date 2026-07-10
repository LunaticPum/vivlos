/**
 * AgentMessageCard - Agent 消息卡片
 *
 * 推理过程两状态：
 *   compact  -> scrollbox height=8 sticky bottom，running 时 spinner 转，complete 时 ✓
 *   expanded -> 完整展示所有内容，无高度限制
 *
 * 状态切换：
 *   compact -> expanded：用户输入 /detail
 *   expanded -> compact：用户再次输入 /detail
 */

import { useState, useEffect, useRef } from "react";
import spinners from "cli-spinners";
import { SyntaxStyle, type ScrollBoxRenderable } from "@opentui/core";
import type { AgentTurn, LogEntry } from "../hooks/useAgent";

const SCROLL_HEIGHT = 8;
const SPINNER = spinners.sand;
const SPINNER_INTERVAL = 80;
const BREATHING_INTERVAL = 130;

/** 全局 SyntaxStyle 实例，markdown 渲染用 */
const syntaxStyle = SyntaxStyle.create();

// #region 颜色常量

const C = {
	borderOuter: "#74c7ec",
	borderInner: "#94e2d5",
	text: "#cdd6f4",
	subtext: "#bac2de",
	thinking: "#cba6f7",
	tool: "#cba6f7",
	toolName: "#f9e2af",
	done: "#a6e3a1",
	bright: "#cdd6f4",
	dim: "#6c7086",
} as const;

// #endregion

export interface AgentMessageCardProps {
	turn: AgentTurn;
	/** /detail 展开状态，由 App 层控制 */
	detailExpanded: boolean;
}

// #region 推理计时器

function useReasoningDuration(status: AgentTurn["status"]): number {
	const [seconds, setSeconds] = useState(0);
	const startRef = useRef(0);
	const finalRef = useRef(0);

	useEffect(() => {
		if (status === "running") {
			startRef.current = Date.now();
			const timer = setInterval(() => {
				setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
			}, 1000);
			return () => clearInterval(timer);
		}
		if (seconds > 0 && finalRef.current === 0) {
			finalRef.current = seconds;
		}
	}, [status]);

	return status === "running" ? seconds : finalRef.current || seconds;
}

// #endregion

// #region 呼吸动画

function useBreathingText(
	text: string,
	active: boolean,
): { char: string; color: string }[] {
	const [tick, setTick] = useState(0);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => setTick((t) => t + 1), BREATHING_INTERVAL);
		return () => clearInterval(timer);
	}, [active]);
	const highlightIdx = tick % text.length;
	return text.split("").map((char, i) => ({
		char,
		color: i === highlightIdx ? C.bright : C.dim,
	}));
}

// #endregion

export function AgentMessageCard({
	turn,
	detailExpanded,
}: AgentMessageCardProps) {
	const duration = useReasoningDuration(turn.status);
	const isRunning = turn.status === "running";
	const isExpanded = !isRunning && detailExpanded;

	// 推理框 bottomTitle
	const bottomTitle = isRunning
		? `Turn ${turn.turnCount} · ${duration}s`
		: `${turn.turnCount} Turns · ${turn.toolCount} Tools · ${duration}s`;

	// 呼吸动画
	const breathing = useBreathingText(
		"少女祈祷中...",
		isRunning && !turn.finalText,
	);

	return (
		<box
			borderStyle="double"
			borderColor={C.borderOuter}
			title="Vivlos"
			titleAlignment="left"
			padding={1}
			marginBottom={1}
			flexDirection="column"
		>
			{/* 推理过程子框 */}
			{turn.log.length > 0 && (
				<box
					borderStyle="single"
					borderColor={C.borderInner}
					title="推理过程"
					titleAlignment="left"
					bottomTitle={bottomTitle}
					bottomTitleAlignment="right"
					paddingX={1}
					marginBottom={1}
				>
					{isExpanded ? (
						<ExpandedLog log={turn.log} />
					) : (
						<CompactLog log={turn.log} active={isRunning} />
					)}
				</box>
			)}

			{/* 最终回复 */}
			{turn.finalText ? (
				<markdown
					content={turn.finalText}
					syntaxStyle={syntaxStyle}
					streaming={isRunning}
					conceal={true}
				/>
			) : isRunning ? (
				<box flexDirection="row">
					{breathing.map((item, i) => (
						<text key={i} fg={item.color}>
							{item.char}
						</text>
					))}
				</box>
			) : null}
		</box>
	);
}

// #region CompactLog -- scrollbox 最多 8 行，sticky bottom

function CompactLog({ log, active }: { log: LogEntry[]; active: boolean }) {
	const spin = useSpinnerFrame(active);
	const lines = log.flatMap((entry) =>
		entryToLines(entry, active ? spin : "✓"),
	);
	const height = Math.min(lines.length, SCROLL_HEIGHT);

	const scrollRef = useRef<ScrollBoxRenderable>(null);

	// 覆写 onMouseEvent，阻止 scroll 事件冒泡到外层
	useEffect(() => {
		const sb = scrollRef.current as any;
		if (!sb) return;
		const original = sb.onMouseEvent.bind(sb);
		sb.onMouseEvent = (event: any) => {
			original(event);
			if (event.type === "scroll") event.stopPropagation?.();
		};
	}, []);

	return (
		<box overflow="hidden" height={height}>
			<scrollbox
				ref={scrollRef}
				height={height}
				stickyScroll={true}
				stickyStart="bottom"
			>
				{lines.map((line, i) => (
					<box key={i} flexDirection="row">
						{line.segments.map((seg, j) => (
							<text key={j} fg={seg.color}>{seg.text}</text>
						))}
					</box>
				))}
			</scrollbox>
		</box>
	);
}

// #endregion

// #region ExpandedLog -- 完整展示，按 turn 分组 + 分隔线

function ExpandedLog({ log }: { log: LogEntry[] }) {
	const groups = new Map<number, LogEntry[]>();
	for (const entry of log) {
		const idx = getTurnIndex(entry);
		const group = groups.get(idx) ?? [];
		group.push(entry);
		groups.set(idx, group);
	}

	const sortedTurns = [...groups.keys()].sort((a, b) => a - b);

	return (
		<box flexDirection="column">
			{sortedTurns.map((turnIdx, i) => (
				<box key={turnIdx} flexDirection="column">
					<text fg={C.borderInner}>{`──── Turn ${turnIdx} ────`}</text>
					{groups.get(turnIdx)!.map((entry, j) => {
						const lines = entryToLines(entry, "✓");
						return lines.map((line, k) => (
							<box key={`${turnIdx}-${j}-${k}`} flexDirection="row">
								{line.segments.map((seg, s) => (
									<text key={s} fg={seg.color}>
										{seg.text}
									</text>
								))}
							</box>
						));
					})}
				</box>
			))}
		</box>
	);
}

// #endregion

// #region 辅助函数

/** 纯文本 spinner 帧 */
function useSpinnerFrame(active: boolean): string {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => {
			setFrame((f) => (f + 1) % SPINNER.frames.length);
		}, SPINNER_INTERVAL);
		return () => clearInterval(timer);
	}, [active]);
	return SPINNER.frames[frame]!;
}

/** 从 LogEntry 提取 turnIndex */
function getTurnIndex(entry: LogEntry): number {
	return entry.turnIndex;
}

/** 一条 LogEntry 渲染为若干行文本 */
interface RenderSegment {
	text: string;
	color: string;
}

interface RenderLine {
	segments: RenderSegment[];
}

function entryToLines(entry: LogEntry, spin: string): RenderLine[] {
	if (entry.kind === "thinking") {
		const lines: RenderLine[] = [
			{
				segments: [
					{
						text: `${entry.done ? "✓" : spin} Thinking...`,
						color: entry.done ? C.done : C.thinking,
					},
				],
			},
		];
		if (entry.text) {
			lines.push({ segments: [{ text: `┆ ${entry.text}`, color: C.subtext }] });
		}
		return lines;
	}

	const prefix = entry.done ? "✓" : spin;
	const lines: RenderLine[] = [
		{
			segments: [
				{ text: `${prefix} Calling `, color: entry.done ? C.done : C.tool },
				{ text: entry.name, color: C.toolName },
			],
		},
	];
	if (entry.result) {
		lines.push({ segments: [{ text: `┆ ${entry.result}`, color: C.subtext }] });
	}
	return lines;
}

// #endregion
