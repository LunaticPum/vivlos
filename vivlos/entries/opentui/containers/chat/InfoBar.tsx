/**
 * InfoBar - 底部上下文感知状态栏
 *
 * 三态切换：
 *   shortcuts（默认 idle） → Tab 键切换 → hints（提示）
 *   shortcuts / hints      → agent 运行中 → running（动画，优先级最高）
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

interface Shortcut {
	key: string;
	label: string;
	color: string;
}

function buildShortcuts(
	detailExpanded: boolean,
	hasCompletedTurn: boolean,
): Shortcut[] {
	const items: Shortcut[] = [
		{ key: "Tab", label: "提示", color: C.muted },
		{ key: "?", label: "帮助", color: C.muted },
		{ key: "q", label: "退出", color: C.muted },
	];
	if (hasCompletedTurn) {
		items.unshift({
			key: "/detail",
			label: detailExpanded ? "收起推理" : "展开推理",
			color: C.accent,
		});
	}
	return items;
}

function buildHints(
	detailExpanded: boolean,
	hasCompletedTurn: boolean,
): string {
	if (hasCompletedTurn) {
		return detailExpanded
			? "● Tip 使用 /detail 收起推理细节  使用 ? 查看所有命令"
			: "● Tip 使用 /detail 展开推理细节  使用 ? 查看所有命令";
	}
	return "● Tip 输入消息开始对话  使用 /help 查看所有命令";
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
					<text fg={C.muted}>esc</text>
					<text fg={C.bright}> 打断</text>
				</box>
			) : showHints ? (
				<text fg={C.muted}>
					{buildHints(detailExpanded, hasCompletedConversation)}
				</text>
			) : (
				<box flexDirection="row">
					{buildShortcuts(detailExpanded, hasCompletedConversation).map(
						(item, i) => (
							<box key={item.key} flexDirection="row">
								{i > 0 && <text fg={C.muted}> </text>}
								<text fg={item.color}>{item.key} </text>
								<text fg={C.muted}>{item.label}</text>
							</box>
						),
					)}
				</box>
			)}
		</box>
	);
}
