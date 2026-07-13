/**
 * ChatArea - 对话区分区
 *
 * 遍历 conversationTurns，渲染 UserMessageCard + AgentMessageCard。
 * 当前用 messages 占位，后续接 useAgent 的 conversationTurns。
 */

import { getColors } from "../../designs/colors";
import { UserMessageCard } from "../../components/UserMessageCard";
import { AgentMessageCard } from "../../components/AgentMessageCard";
import type { ConversationTurn } from "../../hooks/useAgent";
import type { ScrollAcceleration } from "@opentui/core";

const colors = getColors();

const FAST_SCROLL: ScrollAcceleration = {
	tick: () => 3,
	reset: () => {},
};

export interface ChatAreaProps {
	conversationTurns: ConversationTurn[];
	/** /detail 展开状态，传给 AgentMessageCard */
	detailExpanded: boolean;
}

export function ChatArea({ conversationTurns, detailExpanded }: ChatAreaProps) {
	return (
		<box flexGrow={1} overflow="hidden">
			<scrollbox
				height="100%"
				width="100%"
				padding={1}
				stickyScroll={true}
				stickyStart="bottom"
				scrollAcceleration={FAST_SCROLL}
				verticalScrollbarOptions={{ visible: false }}
			>
				{conversationTurns.length === 0 ? (
					<box paddingX={1}>
						<text fg={colors.text.muted}>输入消息开始对话...</text>
					</box>
				) : (
					conversationTurns.map((convTurn, i) => (
						<box
							key={i}
							flexDirection="column"
							marginBottom={1}
							paddingX={1}
							gap={1}
						>
							<UserMessageCard text={convTurn.userInput} />
							<AgentMessageCard
								conversationTurn={convTurn}
								detailExpanded={detailExpanded}
							/>
						</box>
					))
				)}
			</scrollbox>
		</box>
	);
}
