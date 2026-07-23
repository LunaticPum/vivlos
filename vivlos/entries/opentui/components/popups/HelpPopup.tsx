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

const COL_CMD = 16;
const COL_DESC = 23;
const COL_SHORTCUT = 8;

export interface HelpPopupProps {
	commands: TUICommand[];
	onClose: () => void;
}

export function HelpPopup({ commands, onClose }: HelpPopupProps) {
	useKeyboard((key) => {
		if (key.name === "escape") onClose();
	});

	return (
		<box
			width="45%"
			height="45%"
			overflow="hidden"
			border={true}
			borderStyle="rounded"
			borderColor={C.border}
			title=" 指令集 "
			titleAlignment="left"
			paddingX={1}
			backgroundColor={C.bg}
			flexDirection="column"
			alignItems="center"
			paddingTop={1}
			paddingBottom={0}
		>
			<box height="90%" overflow="hidden" width="100%" alignItems="center">
				{commands.map((cmd) => (
					<box key={cmd.name} flexDirection="row" alignItems="center">
						<box width={COL_CMD}>
							<text fg={C.command}>{`/${cmd.name}`}</text>
						</box>
						<box width={COL_DESC}>
							<text fg={C.desc}>{cmd.description}</text>
						</box>
						<box width={COL_SHORTCUT}>
							{cmd.shortcut && <text fg={C.shortcut}>{cmd.shortcut}</text>}
						</box>
					</box>
				))}
			</box>
			<box flexDirection="row" justifyContent="center" width="100%" height={1}>
				<text fg={C.hint}>{"Esc 退出"}</text>
			</box>
		</box>
	);
}
