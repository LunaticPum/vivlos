/**
 * ChatArea - 对话区分区
 *
 * 遍历 turns，渲染 UserMessageCard + AgentMessageCard。
 * 当前用 messages 占位，后续接 useAgent 的 turns。
 */

import { getColors } from "../../designs/colors";
import { UserMessageCard } from "../../components/UserMessageCard";
import { AgentMessageCard } from "../../components/AgentMessageCard";
import type { AgentTurn } from "../../hooks/useAgent";

const colors = getColors();

export interface ChatAreaProps {
	/** 对话轮次（后续替换为 useAgent 的 turns） */
	turns: AgentTurn[];
	/** /detail 展开状态，传给 AgentMessageCard */
	detailExpanded: boolean;
}

export function ChatArea({ turns, detailExpanded }: ChatAreaProps) {
	return (
		<scrollbox
			flexGrow={1}
			width="100%"
			padding={1}
			stickyScroll={true}
			stickyStart="bottom"
		>
			{turns.length === 0 ? (
				<text fg={colors.text.muted}>输入消息开始对话...</text>
			) : (
				turns.map((turn, i) => (
					<box key={i} flexDirection="column">
						<UserMessageCard text={turn.userInput} />
						<AgentMessageCard turn={turn} detailExpanded={detailExpanded} />
					</box>
				))
			)}
		</scrollbox>
	);
}
