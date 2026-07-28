/**
 * ChatControls - Welcome 与 Session 共用的底部控制区。
 *
 * 仅负责组合 StatusBar、InputBar 和 InfoBar；状态与行为由 Workspace 注入。
 */

import { StatusBar, type StatusBarProps } from "./StatusBar";
import { InputBar, type InputBarProps } from "./InputBar";
import { InfoBar, type InfoBarProps } from "./InfoBar";

// #region Props

export interface ChatControlsProps {
	status: StatusBarProps;
	input: InputBarProps;
	info: InfoBarProps;
}

// #endregion

// #region 共享控制区

export function ChatControls({ status, input, info }: ChatControlsProps) {
	return (
		<box paddingX={2} flexShrink={0}>
			<StatusBar {...status} />
			<InputBar {...input} />
			<InfoBar {...info} />
		</box>
	);
}

// #endregion
