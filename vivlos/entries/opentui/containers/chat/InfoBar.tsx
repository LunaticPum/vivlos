/**
 * InfoBar - 底部上下文感知状态栏
 *
 * 三态切换：
 *   shortcuts（默认 idle）: 左侧 Tab 提示  右侧 Ctrl+H 指令集
 *   hints（Tab 切换）: 操作提示文本
 *   running（agent 运行中）: spinner + 打断提示，优先级最高
 */

import { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import spinners from "cli-spinners";

const SPINNER = spinners.dots14;
const SPINNER_INTERVAL = 80;

const C = {
	bright: "#89b4fa",
	muted: "#cdd6f4",
	accent: "#89dceb",
	error: "#f38ba8",
} as const;

export interface InfoBarProps {
	loading: boolean;
	detailExpanded: boolean;
	hasCompletedConversation: boolean;
}

/** 纯文本 spinner */
function useTextSpinner(active: boolean): string {
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

function buildHints(
	detailExpanded: boolean,
	hasCompletedTurn: boolean,
): string {
	if (hasCompletedTurn) {
		return detailExpanded
			? "● Tip 使用 /detail 收起推理细节  使用 Ctrl+O 查看所有命令"
			: "● Tip 使用 /detail 展开推理细节  使用 Ctrl+O 查看所有命令";
	}
	return "● Tip 输入消息开始对话  使用 Ctrl+O 查看所有命令";
}

export function InfoBar({
	loading,
	detailExpanded,
	hasCompletedConversation,
}: InfoBarProps) {
	const [showHints, setShowHints] = useState(false);
	const spin = useTextSpinner(loading);

	useKeyboard((key) => {
		if (key.name === "tab" && !loading) {
			setShowHints((v) => !v);
		}
	});

	return (
		<box height={1} width="100%" flexDirection="row" alignItems="center">
			{loading ? (
				<box flexDirection="row">
					<text fg={C.accent}>{spin} </text>
					<text fg={C.bright}>Ctrl+C </text>
					<text fg={C.muted}>打断</text>
				</box>
			) : showHints ? (
				<text fg={C.muted}>
					{buildHints(detailExpanded, hasCompletedConversation)}
				</text>
			) : (
				<box flexDirection="row" width="100%">
					<text fg={C.bright}>{"Tab "}</text>
					<text fg={C.muted}>{"提示"}</text>
					<box flexGrow={1} />
					<text fg={C.bright}>{"Ctrl+O "}</text>
					<text fg={C.muted}>{"指令集"}</text>
				</box>
			)}
		</box>
	);
}
