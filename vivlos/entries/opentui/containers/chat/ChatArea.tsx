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

const colors = getColors();

export interface ChatAreaProps {
	conversationTurns: ConversationTurn[];
	/** /detail 展开状态，传给 AgentMessageCard */
	detailExpanded: boolean;
}

export function ChatArea({ conversationTurns, detailExpanded }: ChatAreaProps) {
	return (
		<scrollbox
			flexGrow={1}
			width="100%"
			padding={1}
			stickyScroll={true}
			stickyStart="bottom"
		>
			{conversationTurns.length === 0 ? (
				<text fg={colors.text.muted}>输入消息开始对话...</text>
			) : (
				conversationTurns.map((convTurn, i) => (
					<box key={i} flexDirection="column" marginBottom={2}>
						<UserMessageCard text={convTurn.userInput} />
						<AgentMessageCard
							conversationTurn={convTurn}
							detailExpanded={detailExpanded}
						/>
					</box>
				))
			)}
		</scrollbox>
	);
}
