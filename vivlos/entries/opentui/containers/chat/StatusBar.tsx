/**
 * StatusBar - 状态栏分区
 *
 * 两种显示模式：
 *   1. overlay -- 通知/退出/连接状态等，替换整条状态栏
 *   2. session -- 模型 │ token │ 进度 │ id │ 时钟 [│ 状态后缀]
 */

import { useState, useEffect } from "react";
import spinners from "cli-spinners";
import { t, fg, type TextChunk } from "@opentui/core";
import type { Usage } from "@earendil-works/pi-ai";
import type { ConversationTurn } from "../../hooks/useAgent";

const SPINNER = spinners.line;
const SPINNER_INTERVAL = 80;

const C = {
	model: "#74c7ec",
	usage: "#a6da95",
	clock: "#fab387",
	error: "#f38ba8",
	warning: "#f9e2af",
	success: "#a6e3a1",
	divider: "#cba6f7",
	bg: "#232634",
} as const;

const notifColors: Record<string, (s: string) => TextChunk> = {
	warning: fg(C.warning),
	success: fg(C.success),
	error: fg(C.error),
};

/** API Key 连接验证状态 */
export type ConnectionStatus =
	| { state: "idle" }
	| { state: "connecting"; provider: string }
	| { state: "success"; provider: string }
	| { state: "failed"; provider: string; error?: string };

export interface StatusBarProps {
	modelLabel: string;
	loading?: boolean;
	error?: string | null;
	turnStatus?: ConversationTurn["status"];
	connectionStatus?: ConnectionStatus;
	connected?: boolean;
	exitPending?: boolean;
	notification?: { message: string; color?: string } | null;
	showSession?: boolean;
	sessionId?: string;
	usage?: Usage;
	contextWindow?: number;
}

function useSessionDuration(resetKey?: string): string {
	const [seconds, setSeconds] = useState(0);
	useEffect(() => {
		const start = Date.now();
		setSeconds(0);
		const timer = setInterval(() => {
			setSeconds(Math.floor((Date.now() - start) / 1000));
		}, 1000);
		return () => clearInterval(timer);
	}, [resetKey]);
	const mm = Math.floor(seconds / 60);
	const ss = seconds % 60;
	return `${mm}m${ss.toString().padStart(2, "0")}s`;
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)}M`;
	if (n >= 10_000) return `${Math.floor(n / 1_000)}k`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return `${n}`;
}

function useContextBar(usage: Usage | undefined, contextWindow: number | undefined) {
	const windowLabel = formatTokens(contextWindow ?? 0);
	if (!usage || !contextWindow || contextWindow === 0) {
		return { bar: "░".repeat(8), percent: 0, tokenLabel: `0/${windowLabel}`, barColor: C.usage };
	}
	const used = usage.input + usage.cacheRead + usage.cacheWrite;
	const percent = Math.round((used / contextWindow) * 100);
	const filled = Math.round((percent / 100) * 8);
	const bar = "█".repeat(filled) + "░".repeat(8 - filled);
	const barColor = percent > 70 ? C.error : percent > 50 ? C.warning : C.usage;
	return { bar, percent, tokenLabel: `${formatTokens(used)}/${windowLabel}`, barColor };
}

function useSpinner(active: boolean): string {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER.frames.length), SPINNER_INTERVAL);
		return () => clearInterval(timer);
	}, [active]);
	return SPINNER.frames[frame]!;
}

export function StatusBar({
	modelLabel,
	error = null,
	turnStatus,
	connectionStatus = { state: "idle" },
	connected = true,
	exitPending = false,
	notification = null,
	showSession = true,
	sessionId,
	usage,
	contextWindow,
}: StatusBarProps) {
	const duration = useSessionDuration(sessionId);
	const { bar, percent, tokenLabel, barColor } = useContextBar(usage, contextWindow);
	const spin = useSpinner(connectionStatus.state === "connecting");

	const sep = " │ ";
	let content: ReturnType<typeof t>;

	// ── overlay 消息（替换整条状态栏）──
	if (notification) {
		const fn = notification.color ? (notifColors[notification.color] ?? fg(C.warning)) : fg(C.warning);
		content = t` ${fn(notification.message)} `;
	} else if (exitPending) {
		content = t` ${fg(C.warning)("再按一次 Ctrl+C 退出应用")} `;
	} else if (connectionStatus.state === "connecting") {
		content = t` ${fg(C.warning)(`${spin} ${connectionStatus.provider} connecting...`)} `;
	} else if (connectionStatus.state === "success") {
		content = t` ${fg(C.success)(`✓ ${connectionStatus.provider} connect success`)} `;
	} else if (connectionStatus.state === "failed") {
		const detail = connectionStatus.error ? `: ${connectionStatus.error}` : "";
		content = t` ${fg(C.error)(`✗ ${connectionStatus.provider} connect failed${detail}`)} `;
	} else if (!connected) {
		content = t` ${fg(C.warning)("未连接 LLM，输入 /providers 或 Ctrl+P 连接...")} `;
	} else if (showSession) {
		// ── session 显示（共享模板 + 动态后缀）──
		const segModel = fg(C.model)(modelLabel);
		const d = fg(C.divider)(sep);
		const segTokens = fg(C.usage)(tokenLabel);
		const segBar = fg(barColor)(`${bar} ${percent}%`);
		const segSession = fg(C.usage)(sessionId?.slice(0, 8) ?? "");
		const segClock = fg(C.clock)(duration);

		if (turnStatus === "aborted") {
			content = t` ${segModel}${d}${segTokens}${d}${segBar}${d}${fg(C.divider)("id:")}${segSession}${d}${segClock}${d}${fg(C.warning)("⚠️ 请求已中断")} `;
		} else if (error) {
			content = t` ${segModel}${d}${segTokens}${d}${segBar}${d}${fg(C.divider)("id:")}${segSession}${d}${segClock}${d}${fg(C.error)(`✗ ${error}`)} `;
		} else {
			content = t` ${segModel}${d}${segTokens}${d}${segBar}${d}${fg(C.divider)("id:")}${segSession}${d}${segClock} `;
		}
	} else {
		content = t``;
	}

	return (
		<box height={1} width="100%" flexDirection="row" alignItems="center">
			<text bg={C.bg} content={content} selectable={false} />
		</box>
	);
}
