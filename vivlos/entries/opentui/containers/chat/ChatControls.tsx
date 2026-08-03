/**
 * ChatControls - Welcome 与 Session 共用的底部控制区。
 *
 * 仅负责组合 StatusBar、InputBar 和 InfoBar；状态与行为由 Workspace 注入。
 */

import {
	StatusBar,
	type StatusBarProps,
} from "../../components/chat/chat_control/StatusBar";
import {
	InputBar,
	type InputBarProps,
} from "../../components/chat/chat_control/InputBar";
import {
	InfoBar,
	type InfoBarProps,
} from "../../components/chat/chat_control/InfoBar";
import {
	OfferChoiceControls,
	type OfferChoiceControlsProps,
} from "../../components/chat/chat_control/OfferChoiceControls";

// #region Props

export interface ChatControlsProps {
	status: StatusBarProps;
	input: InputBarProps;
	info: InfoBarProps;
	offerChoice?: OfferChoiceControlsProps & { readonly toolCallId: string };
}

// #endregion

// #region 共享控制区

export function ChatControls({ status, input, info, offerChoice }: ChatControlsProps) {
	return (
		<box paddingX={2} flexShrink={0} position="relative" zIndex={50}>
			<StatusBar {...status} />
			{offerChoice ? (
				<OfferChoiceControls
					key={offerChoice.toolCallId}
					questions={offerChoice.questions}
					onResolve={offerChoice.onResolve}
					onAbort={offerChoice.onAbort}
				/>
			) : (
				<>
					<InputBar {...input} />
					<InfoBar {...info} />
				</>
			)}
		</box>
	);
}

// #endregion
