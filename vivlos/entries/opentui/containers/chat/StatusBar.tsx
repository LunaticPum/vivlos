/**
 * StatusBar - 状态栏分区
 *
 * 仿 Hermes 风格，一行四段：
 *   provider/model │ k/1M │ 上下文进度条 ..% │ 会话用时
 *
 * 额外状态（优先级从高到低）：
 *   1. connectionStatus -- 连接验证中/成功/失败
 *   2. commandError -- 未知指令错误（3s 自动消失）
 *   3. error / aborted -- agent 错误
 *   4. 正常四段显示
 *
 * 上下文计算暂为占位，后续接入 token 统计。
 */

import { useState, useEffect } from "react";
import spinners from "cli-spinners";
import { t, fg } from "@opentui/core";
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

/** API Key 连接验证状态 */
export type ConnectionStatus =
	| { state: "idle" }
	| { state: "connecting"; provider: string }
	| { state: "success"; provider: string }
	| { state: "failed"; provider: string; error?: string };

export interface StatusBarProps {
	/** 模型标签，如 "deepseek/deepseek-v4-pro" */
	modelLabel: string;
	/** agent 是否运行中 */
	loading?: boolean;
	/** agent 错误信息 */
	error?: string | null;
	/** 当前 turn 状态，用于区分 aborted/error */
	turnStatus?: ConversationTurn["status"];
	/** 未知指令错误（ChatPanel 管理，3s 自动清除） */
	commandError?: string | null;
	/** API Key 连接验证状态 */
	connectionStatus?: ConnectionStatus;
	/** 是否已连接 provider（false 时显示未连接提示） */
	connected?: boolean;
}

/** 会话计时器 */
function useSessionDuration(): string {
	const [seconds, setSeconds] = useState(0);
	useEffect(() => {
		const start = Date.now();
		const timer = setInterval(() => {
			setSeconds(Math.floor((Date.now() - start) / 1000));
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	const mm = Math.floor(seconds / 60);
	const ss = seconds % 60;
	return `${mm}m${ss.toString().padStart(2, "0")}s`;
}

/** 上下文进度条占位 */
// TODO: 后续接入真实 token 统计
function useContextBar() {
	const percent = 0;
	const barWidth = 8;
	const filled = Math.round((percent / 100) * barWidth);
	const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
	return { bar, percent };
}

/** connecting 状态下的 spinner 帧 */
function useSpinner(active: boolean): string {
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

export function StatusBar({
	modelLabel,
	error = null,
	turnStatus,
	commandError = null,
	connectionStatus = { state: "idle" },
	connected = true,
}: StatusBarProps) {
	const duration = useSessionDuration();
	const { bar, percent } = useContextBar();
	const spin = useSpinner(connectionStatus.state === "connecting");

	const sep = " │ ";

	// ── 构建显示内容（优先级从高到低）──
	let content: ReturnType<typeof t>;

	if (connectionStatus.state === "connecting") {
		content = t` ${fg(C.warning)(`${spin} ${connectionStatus.provider} connecting...`)} `;
	} else if (connectionStatus.state === "success") {
		content = t` ${fg(C.success)(`✓ ${connectionStatus.provider} connect success`)} `;
	} else if (connectionStatus.state === "failed") {
		const detail = connectionStatus.error ? `: ${connectionStatus.error}` : "";
		content = t` ${fg(C.error)(`✗ ${connectionStatus.provider} connect failed${detail}`)} `;
	} else if (commandError) {
		content = t` ${fg(C.error)(`✗ ${commandError}`)} `;
	} else if (!connected) {
		content = t` ${fg(C.warning)("未连接 LLM，输入 /providers 或 Ctrl+P 连接...")} `;
	} else if (turnStatus === "aborted") {
		content = t` ${fg(C.model)(modelLabel)}${fg(C.divider)(sep)}${fg(C.usage)("0k/1M")}${fg(C.divider)(sep)}${fg(C.usage)(`${bar} ${percent}%`)}${fg(C.divider)(sep)}${fg(C.clock)(duration)}${fg(C.divider)(sep)}${fg(C.warning)("⚠️ 请求已中断")} `;
	} else if (error) {
		content = t` ${fg(C.model)(modelLabel)}${fg(C.divider)(sep)}${fg(C.usage)("0k/1M")}${fg(C.divider)(sep)}${fg(C.usage)(`${bar} ${percent}%`)}${fg(C.divider)(sep)}${fg(C.clock)(duration)}${fg(C.divider)(sep)}${fg(C.error)(`✗ ${error}`)} `;
	} else {
		content = t` ${fg(C.model)(modelLabel)}${fg(C.divider)(sep)}${fg(C.usage)("0k/1M")}${fg(C.divider)(sep)}${fg(C.usage)(`${bar} ${percent}%`)}${fg(C.divider)(sep)}${fg(C.clock)(duration)} `;
	}

	return (
		<box height={1} width="100%" flexDirection="row" alignItems="center">
			<text bg={C.bg} content={content} selectable={false} />
		</box>
	);
}
