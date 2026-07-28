/**
 * ChatArea - 对话区分区
 *
 * 遍历 conversationTurns，渲染 UserMessageCard + AgentMessageCard。
 * WelcomeScreen 由 Workspace 单独管理，本组件只负责会话内容。
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
	detailExpanded: boolean;
}

export function ChatArea({ conversationTurns, detailExpanded }: ChatAreaProps) {
	return (
		<box flexGrow={1} overflow="hidden">
			<box flexGrow={1} overflow="hidden" width="100%">
				<scrollbox
					height="100%"
					width="100%"
					stickyScroll={true}
					stickyStart="bottom"
					scrollAcceleration={FAST_SCROLL}
					verticalScrollbarOptions={{ visible: false }}
				>
					{conversationTurns.map((convTurn, i) => (
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
					))}
				</scrollbox>
			</box>
		</box>
	);
}
