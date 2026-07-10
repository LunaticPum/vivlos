/**
 * AgentMessageCard - Agent 消息卡片
 *
 * 推理过程两状态：
 *   compact  -> scrollbox height=min(n,8) sticky bottom，running 时 spinner 转，complete 时 ✓
 *   expanded -> 完整展示所有内容，无高度限制
 */

import { useState, useEffect, useRef } from "react";
import spinners from "cli-spinners";
import {
	SyntaxStyle,
	type ScrollBoxRenderable,
	type BorderCharacters,
} from "@opentui/core";
import type { AgentTurn, LogEntry } from "../hooks/useAgent";

const SCROLL_HEIGHT = 8;
const SPINNER = spinners.sand;
const SPINNER_INTERVAL = 80;
const BREATHING_INTERVAL = 110;

/** 全局 SyntaxStyle 实例，markdown 渲染用 */
const syntaxStyle = SyntaxStyle.create();

// #region 颜色常量
const C = {
	borderOuter: "#74c7ec",
	borderInner: "#94e2d5",
	subtext: "#bac2de",
	thinking: "#cba6f7",
	tool: "#cba6f7",
	toolName: "#fab387",
	done: "#a6e3a1",
	bright: "#ffdbdb",
	dim: "#ff9d9d",
} as const;
// #endregion

// #region 子文本左竖线边框
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

export interface AgentMessageCardProps {
	turn: AgentTurn;
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
	const idx = tick % text.length;
	return [...text].map((char, i) => ({
		char,
		color: i === idx ? C.bright : C.dim,
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
	const bottomTitle = isRunning
		? `Turn ${turn.turnCount} · ${duration}s`
		: `${turn.turnCount} Turns · ${turn.toolCount} Tools · ${duration}s`;
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
			{turn.finalText ? (
				<markdown
					content={turn.finalText}
					syntaxStyle={syntaxStyle}
					streaming={isRunning}
					conceal={!isRunning}
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

// #region 类型 & entryToLines

interface RenderSegment {
	text: string;
	color: string;
}
interface RenderLine {
	segments: RenderSegment[];
}
type LogLines = [RenderLine, ...RenderLine[]];

function entryToLines(entry: LogEntry, spin: string): LogLines {
	if (entry.kind === "thinking") {
		const main: RenderLine = {
			segments: [
				{
					text: `${entry.done ? "✓" : spin} Thinking...`,
					color: entry.done ? C.done : C.thinking,
				},
			],
		};
		if (!entry.text) return [main];
		const sub: RenderLine[] = entry.text
			.split("\n")
			.filter(Boolean)
			.map((line) => ({
				segments: [{ text: line, color: C.subtext }],
			}));
		return [main, ...sub];
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

// #region CompactLog

function CompactLog({ log, active }: { log: LogEntry[]; active: boolean }) {
	const spin = useSpinnerFrame(active);
	const entries = log.map((entry) => entryToLines(entry, active ? spin : "✓"));
	const allLines = log.flatMap((entry) => entryToLines(entry, active ? spin : "✓"));
	const height = Math.min(allLines.length, SCROLL_HEIGHT);
	const scrollRef = useRef<ScrollBoxRenderable>(null);

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
				stickyScroll
				stickyStart="bottom"
			>
				{entries.map(([main, ...sub], i) => (
					<box key={i} flexDirection="column">
						<box flexDirection="row">
							{main.segments.map((seg, j) => (
								<text key={j} fg={seg.color}>
									{seg.text}
								</text>
							))}
						</box>
						{sub.length > 0 && (
							<box
								border={["left"]}
								customBorderChars={textBlock}
								borderColor={C.subtext}
								paddingX={1}
							>
								{sub.map((line, j) => (
									<text key={j} fg={C.subtext}>
										{line.segments[0].text}
									</text>
								))}
							</box>
						)}
					</box>
				))}
			</scrollbox>
		</box>
	);
}

// #endregion

// #region ExpandedLog

function ExpandedLog({ log }: { log: LogEntry[] }) {
	const groups = new Map<number, LogEntry[]>();
	for (const entry of log) {
		const idx = entry.turnIndex;
		(groups.get(idx) ?? groups.set(idx, []).get(idx))!.push(entry);
	}
	return (
		<box flexDirection="column">
			{[...groups.keys()]
				.sort((a, b) => a - b)
				.map((turnIdx) => {
					const entries = groups.get(turnIdx)!;
					return (
						<box key={turnIdx} flexDirection="column">
							<text fg={C.borderInner}>{`──── Turn ${turnIdx} ────`}</text>
							{entries.flatMap((entry) => {
								const [main, ...sub] = entryToLines(entry, "✓");
								return [
									<box key={`${turnIdx}-main`} flexDirection="row">
										{main.segments.map((seg, j) => (
											<text key={j} fg={seg.color}>
												{seg.text}
											</text>
										))}
									</box>,
									sub.length > 0 && (
										<box
											key={`${turnIdx}-sub`}
											border={["left"]}
											customBorderChars={textBlock}
											borderColor={C.subtext}
											paddingX={1}
										>
											{sub.map((line, j) => (
												<text key={j} fg={C.subtext}>
													{line.segments[0].text}
												</text>
											))}
										</box>
									),
								];
							})}
						</box>
					);
				})}
		</box>
	);
}

// #endregion

// #region 辅助
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
