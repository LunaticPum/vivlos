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

// #region 常量

const SCROLL_HEIGHT = 8;
const SPINNER = spinners.dots7;
const SPINNER_INTERVAL = 80;
const BREATHING_INTERVAL = 110;

/** 全局 SyntaxStyle 实例，markdown 渲染用 */
const syntaxStyle = SyntaxStyle.create();

/** 颜色常量 */
const C = {
	borderOuter: "#74c7ec",
	borderInner: "#94e2d5",
	text: "#cdd6f4",
	subtext: "#bac2de",
	thinking: "#f5c2e7",
	tool: "#eba0ac",
	toolName: "#fab387",
	done: "#a6e3a1",
	bright: "#f5c2e7",
	dim: "#eba0ac",
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
	turn: AgentTurn;
	detailExpanded: boolean;
}

/** 推理框计时器 */
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

/** 呼吸动画："少女祈祷中..." 逐字符高亮 */
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

export function AgentMessageCard({
	turn,
	detailExpanded,
}: AgentMessageCardProps) {
	const duration = useReasoningDuration(turn.status);
	const isRunning = turn.status === "running";
	const isExpanded = !isRunning && detailExpanded;
	const bottomTitle = isRunning
		? ` Turn ${turn.turnCount} · ${duration}s `
		: ` ${turn.turnCount} Turns · ${turn.toolCount} Tools · ${duration}s `;
	const breathing = useBreathingText(
		"少女祈祷中...",
		isRunning && !turn.finalText,
	);

	return (
		<box
			borderStyle="double"
			borderColor={C.borderOuter}
			title=" Vivlos "
			titleAlignment="left"
			padding={1}
			marginBottom={1}
			flexDirection="column"
		>
			{turn.log.length > 0 && (
				<box
					borderStyle="single"
					borderColor={C.borderInner}
					title=" 推理过程 "
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
					fg={C.text}
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

/** 估算 markdown 文本渲染行数，用于 scrollbox 高度自适应 */
function estimateHeight(text: string): number {
	return text.split("\n").length;
}

/**
 * 将一条 LogEntry 转为渲染项。
 * 返回 [主行, ...子文本行]。主行是 "✓ Thinking..." / "✓ Calling xxx"，
 * 子文本行用 markdown 或纯文本渲染。
 */
function entryToLines(entry: LogEntry, spin: string): LogLines {
	if (entry.kind === "thinking") {
		const main: RenderLine = {
			segments: [
				{
					text: `${entry.done ? "✓ Thinking" : spin + " Thinking..."}`,
					color: entry.done ? C.done : C.thinking,
				},
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

/** compact 视图：scrollbox 最多 8 行，高度自适应 1~8 */
function CompactLog({ log, active }: { log: LogEntry[]; active: boolean }) {
	const spin = useSpinnerFrame(active);
	const entries = log.map((entry) => entryToLines(entry, active ? spin : "✓"));
	const height = Math.min(
		entries.reduce((sum, [, ...sub]) => {
			let h = 1;
			for (const line of sub)
				h += line.markdown ? estimateHeight(line.segments[0].text) : 1;
			return sum + h;
		}, 0),
		SCROLL_HEIGHT,
	);
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
						{renderSub(sub, `sub-${i}`)}
					</box>
				))}
			</scrollbox>
		</box>
	);
}

/** expanded 视图：完整展示，按 turn 分组 + 分隔线 */
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
				.map((turnIdx) => (
					<box key={turnIdx} flexDirection="column">
						<text fg={C.borderInner}>{`───── Turn ${turnIdx} ─────`}</text>
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
