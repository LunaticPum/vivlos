/**
 * HelpPopup - 指令帮助弹窗 (Ctrl+O)
 *
 * 列出所有已注册的 slash 指令及对应快捷键。
 * 指令 / 描述 / 快捷键 三列对齐。
 * 只读展示，Esc 退出。
 */

import { useKeyboard } from "@opentui/react";
import type { TUICommand } from "../../commands/types.ts";

const C = {
	border: "#89dceb",
	bg: "#1e1e2e",
	header: "#6c7086",
	command: "#cba6f7",
	desc: "#cdd6f4",
	shortcut: "#a6e3a1",
	hint: "#6c7086",
} as const;

/** 指令名列宽（含 / 前缀） */
const COL_CMD = 14;
/** 描述列宽 */
const COL_DESC = 22;

export interface HelpPopupProps {
	/** 已注册的指令列表 */
	commands: TUICommand[];
	/** 关闭弹窗 */
	onClose: () => void;
}

export function HelpPopup({ commands, onClose }: HelpPopupProps) {
	useKeyboard((key) => {
		if (key.name === "escape") onClose();
	});

	return (
		<box
			border={true}
			borderStyle="rounded"
			borderColor={C.border}
			title=" 指令集 "
			titleAlignment="left"
			paddingX={1}
			paddingY={1}
			backgroundColor={C.bg}
			flexDirection="column"
			alignItems="center"
		>
			{/* 表头 */}
			<box flexDirection="row">
				<box width={COL_CMD}>
					<text fg={C.header}>{"指令"}</text>
				</box>
				<box width={COL_DESC}>
					<text fg={C.header}>{"描述"}</text>
				</box>
				<text fg={C.header}>{"快捷键"}</text>
			</box>
			{/* 指令列表 */}
			<box flexDirection="column" marginTop={1}>
				{commands.map((cmd) => (
					<box key={cmd.name} flexDirection="row">
						<box width={COL_CMD}>
							<text fg={C.command}>{`/${cmd.name}`}</text>
						</box>
						<box width={COL_DESC}>
							<text fg={C.desc}>{cmd.description}</text>
						</box>
						{cmd.shortcut && <text fg={C.shortcut}>{cmd.shortcut}</text>}
					</box>
				))}
			</box>
			<box height={1} />
			<box flexDirection="row" justifyContent="center" width="100%">
				<text fg={C.hint}>{"Esc 退出"}</text>
			</box>
		</box>
	);
}
