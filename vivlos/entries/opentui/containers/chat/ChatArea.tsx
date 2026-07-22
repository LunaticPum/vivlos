/**
 * ChatArea - 对话区分区
 *
 * 遍历 conversationTurns，渲染 UserMessageCard + AgentMessageCard。
 * 无对话时显示 WelcomeScreen。
 */

import { getColors } from "../../designs/colors";
import { UserMessageCard } from "../../components/UserMessageCard";
import { AgentMessageCard } from "../../components/AgentMessageCard";
import { WelcomeScreen } from "../../components/WelcomeScreen";
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
	/** 欢迎界面信息 */
	welcomeInfo?: {
		cwd: string;
		sessionId: string;
		modelLabel: string;
		version: string;
	};
}

export function ChatArea({ conversationTurns, detailExpanded, welcomeInfo }: ChatAreaProps) {
	return (
		<box flexGrow={1} overflow="hidden">
			{conversationTurns.length === 0 && welcomeInfo ? (
				<WelcomeScreen
					cwd={welcomeInfo.cwd}
					sessionId={welcomeInfo.sessionId}
					modelLabel={welcomeInfo.modelLabel}
					version={welcomeInfo.version}
				/>
			) : (
				<scrollbox
					height="100%"
					width="100%"
					padding={1}
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
			)}
		</box>
	);
}
