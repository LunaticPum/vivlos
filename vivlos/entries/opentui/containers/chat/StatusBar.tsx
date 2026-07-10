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

const C = {
	model: "#74c7ec",
	default: "#74c7ec",
	usage: "#a6da95",
	clock: "#fab387",
	error: "#f38ba8",
	divider: "#ca9ee6",
	bg: "#232634",
} as const;

export interface StatusBarProps {
	/** 模型标签，如 "deepseek/deepseek-v4-pro" */
	modelLabel: string;
	/** agent 是否运行中 */
	loading?: boolean;
	/** 错误信息 */
	error?: string | null;
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
}: StatusBarProps) {
	const duration = useSessionDuration();
	const { bar, percent } = useContextBar();

	const sep = " │ ";

	const content = t`${fg(C.model)(modelLabel)}${fg(C.divider)(sep)}${fg(C.usage)("0k/1M")}${fg(C.divider)(sep)}${fg(C.usage)(`${bar} ${percent}%`)}${fg(C.divider)(sep)}${fg(C.clock)(duration)}${error ? fg(C.divider)(sep) : ""}${error ? fg(C.error)(`✗ ${error}`) : ""}`;

	return (
		<box height={1} width="100%" flexDirection="row" alignItems="center">
			<text bg={C.bg} content={content} />
		</box>
	);
}
