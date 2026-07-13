/**
 * StatusBar - 状态栏分区
 *
 * 仿 Hermes 风格，一行四段：
 *   provider/model │ k/1M │ 上下文进度条 ..% │ 会话用时
 *
 * 上下文计算暂为占位，后续接入 token 统计。
 */

import { useState, useEffect } from "react";
import { t, fg } from "@opentui/core";
import type { ConversationTurn } from "../../hooks/useAgent";

const C = {
	model: "#74c7ec",
	default: "#74c7ec",
	usage: "#a6da95",
	clock: "#fab387",
	error: "#f38ba8",
	warning: "#f9e2af",
	divider: "#cba6f7",
	bg: "#232634",
} as const;

export interface StatusBarProps {
	/** 模型标签，如 "deepseek/deepseek-v4-pro" */
	modelLabel: string;
	/** agent 是否运行中 */
	loading?: boolean;
	/** 错误信息 */
	error?: string | null;
	/** 当前 turn 状态，用于区分 aborted/error */
	turnStatus?: ConversationTurn["status"];
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

export function StatusBar({
	modelLabel,
	error = null,
	turnStatus,
}: StatusBarProps) {
	const duration = useSessionDuration();
	const { bar, percent } = useContextBar();

	const sep = " │ ";

	// 错误/中断显示：aborted 用 ! 前缀，error 用 ✗ 前缀
	let content: ReturnType<typeof t>;
	if (turnStatus === "aborted") {
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
