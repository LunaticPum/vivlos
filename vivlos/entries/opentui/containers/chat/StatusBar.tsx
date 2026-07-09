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
import spinners from "cli-spinners";
import { getColors } from "../../designs/colors";

const colors = getColors();

const SPINNER = spinners.mindblown;
const SPINNER_INTERVAL = 110;

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

/** 纯文本 spinner，返回当前帧，可嵌入 t 模板 */
function useTextSpinner(active: boolean): string {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => {
			setFrame((f) => (f + 1) % SPINNER.frames.length);
		}, SPINNER_INTERVAL);
		return () => clearInterval(timer);
	}, [active]);
	return active ? SPINNER.frames[frame]! : "";
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
	loading = false,
	error = null,
}: StatusBarProps) {
	const spin = useTextSpinner(loading);
	const duration = useSessionDuration();
	const { bar, percent } = useContextBar();

	const color1 = colors.code.inline;
	const color2 = colors.code.block;
	const color3 = colors.border.divider;
	const sep = " │ ";

	const content = t` ${spin ? `${spin}` : ""}${fg(color1)(modelLabel)}${fg(color3)(sep)}${fg(color1)("0k/1M")}${fg(color3)(sep)}${fg(color2)(`${bar} ${percent}%`)}${fg(color3)(sep)}${fg(color1)(duration)}${error ? fg(color3)(sep) : ""}${error ? fg(colors.semantic.error)(`✗ ${error}`) : ""} `;

	return (
		<box height={1} width="100%" flexDirection="row" alignItems="center">
			<text bg={colors.bg.mantle} fg={colors.text.primary} content={content} />
		</box>
	);
}
