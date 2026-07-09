/**
 * AgentMessageCard - Agent 消息卡片
 *
 * 推理过程三状态：
 *   running  -> 只显示当前 turn 的日志（最多 8 行），bottomTitle 动态计时
 *   collapsed -> 最后一次 thinking 的 text + (输入 /detail 查看详细...)，bottomTitle 固定
 *   expanded -> 所有 turn 的日志 + 分隔线，bottomTitle 固定
 *
 * 状态切换：
 *   running -> collapsed：agent:complete 触发
 *   collapsed <-> expanded：用户输入 /detail 切换
 */

import { useState, useEffect, useRef } from "react";
import spinners from "cli-spinners";
import type { AgentTurn, LogEntry } from "../hooks/useAgent";

const MAX_LOG_LINES = 8;
const SPINNER = spinners.dots;
const SPINNER_INTERVAL = 80;

// #region 颜色常量

const C = {
	borderOuter: "#74c7ec",
	borderInner: "#94e2d5",
	text: "#cdd6f4",
	muted: "#6c7086",
	thinking: "#94e2d5",
	tool: "#74c7ec",
	toolName: "#fab387",
	done: "#a6e3a1",
	running: "#cba6f7",
	divider: "#6c7086",
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

	return status === "running" ? seconds : (finalRef.current || seconds);
}

// #endregion

export function AgentMessageCard({
	turn,
	detailExpanded,
}: AgentMessageCardProps) {
	const duration = useReasoningDuration(turn.status);
	const isRunning = turn.status === "running";
	const isCollapsed = !isRunning && !detailExpanded;
	const isExpanded = !isRunning && detailExpanded;

	// 推理框 bottomTitle
	const bottomTitle = isRunning
		? `Turn ${turn.turnCount} · ${duration}s`
		: `${turn.turnCount} Turns · ${turn.toolCount} Tools · ${duration}s`;

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
					{isRunning && <RunningLog log={turn.log} />}
					{isCollapsed && <CollapsedLog turn={turn} />}
					{isExpanded && <ExpandedLog log={turn.log} />}
				</box>
			)}

			{/* 最终回复 */}
			{turn.finalText ? (
				<text fg={C.text}>{turn.finalText}</text>
			) : isRunning ? (
				<text fg={C.muted}>Thinking...</text>
			) : null}
		</box>
	);
}

// #region RunningLog -- 当前 turn 的日志，最多 8 行

/** 纯文本 spinner 帧，用于 running 状态的日志条目前缀 */
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

function RunningLog({ log }: { log: LogEntry[] }) {
	const spin = useSpinnerFrame(true);
	const lines = log.flatMap((entry) => entryToLines(entry, spin));

	// 超过 8 行：只取最后 7 条 + 末尾 (truncated...)
	if (lines.length > MAX_LOG_LINES) {
		const visible = lines.slice(0, MAX_LOG_LINES - 1);
		return (
			<box flexDirection="column">
				{visible.map((line, i) => (
					<text key={i} fg={line.color}>{line.text}</text>
				))}
				<text fg={C.muted}>{"(truncated...)"}</text>
			</box>
		);
	}

	return (
		<box flexDirection="column">
			{lines.map((line, i) => (
				<text key={i} fg={line.color}>{line.text}</text>
			))}
		</box>
	);
}

// #endregion

// #region CollapsedLog -- 最后一次 thinking 的文本 + 提示

function CollapsedLog({ turn }: { turn: AgentTurn }) {
	const lastThinking = [...turn.log]
		.reverse()
		.find((e) => e.kind === "thinking" && e.done);

	return (
		<box flexDirection="column">
			{lastThinking && lastThinking.kind === "thinking" && (
				<>
					<text fg={C.done}>{"✓ Thinking..."}</text>
					{lastThinking.text && (
						<text fg={C.muted}>{"  ┆ "}{lastThinking.text}</text>
					)}
				</>
			)}
			<text fg={C.muted}>{"(输入 /detail 查看详细...)"}</text>
		</box>
	);
}

// #endregion

// #region ExpandedLog -- 所有 turn 的日志 + 分隔线

function ExpandedLog({ log }: { log: LogEntry[] }) {
	// 按 turnIndex 分组
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
					{i > 0 && (
						<text fg={C.divider}>{`─── Turn ${turnIdx} ───`}</text>
					)}
					{groups.get(turnIdx)!.map((entry, j) => {
						const lines = entryToLines(entry, "✓");
						return lines.map((line, k) => (
							<text key={`${turnIdx}-${j}-${k}`} fg={line.color}>{line.text}</text>
						));
					})}
				</box>
			))}
		</box>
	);
}

// #endregion

// #region 辅助函数

/** 从 LogEntry 提取 turnIndex */
function getTurnIndex(entry: LogEntry): number {
	return entry.turnIndex;
}

/** 一条 LogEntry 渲染为若干行文本 */
interface RenderLine {
	text: string;
	color: string;
}

function entryToLines(entry: LogEntry, spin: string): RenderLine[] {
	if (entry.kind === "thinking") {
		const lines: RenderLine[] = [
			{
				text: `${entry.done ? "✓" : spin} Thinking...`,
				color: entry.done ? C.done : C.thinking,
			},
		];
		if (entry.text) {
			lines.push({ text: `  ┆ ${entry.text}`, color: C.muted });
		}
		return lines;
	}

	const lines: RenderLine[] = [
		{
			text: `${entry.done ? "✓" : spin} Calling ${entry.name}`,
			color: entry.done ? C.done : C.tool,
		},
	];
	if (entry.result) {
		lines.push({ text: `  ┆ ${entry.result}`, color: C.muted });
	}
	return lines;
}

// #endregion
