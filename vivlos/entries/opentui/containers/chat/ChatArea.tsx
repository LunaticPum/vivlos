/**
 * ChatArea - 对话区分区
 *
 * 遍历 conversationTurns，渲染 UserMessageCard + AgentMessageCard。
 * showWelcome 为 true 且无对话时显示 WelcomeScreen。
 * showWelcome 为 false 时显示空对话区（/clear 后）。
 */

import { getColors } from "../../designs/colors";
import { UserMessageCard } from "../../components/UserMessageCard";
import { AgentMessageCard } from "../../components/AgentMessageCard";
import { WelcomeScreen } from "../../components/WelcomeScreen";
import type { ConversationTurn } from "../../hooks/useAgent";
import type { ScrollAcceleration } from "@opentui/core";
import type { PiAiVersionInfo } from "@vivlos/infra/version.ts";

const colors = getColors();

const FAST_SCROLL: ScrollAcceleration = {
	tick: () => 3,
	reset: () => {},
};

export interface ChatAreaProps {
	conversationTurns: ConversationTurn[];
	detailExpanded: boolean;
	/** true=显示欢迎窗口（/new 后），false=显示空对话区（/clear 后） */
	showWelcome?: boolean;
	welcomeInfo?: {
		cwd: string;
		sessionId: string;
		modelLabel: string;
		version: string;
		piAi: PiAiVersionInfo;
	};
}

export function ChatArea({ conversationTurns, detailExpanded, showWelcome, welcomeInfo }: ChatAreaProps) {
	return (
		<box flexGrow={1} overflow="hidden">
			{conversationTurns.length === 0 && showWelcome && welcomeInfo ? (
				<WelcomeScreen
					cwd={welcomeInfo.cwd}
					sessionId={welcomeInfo.sessionId}
					modelLabel={welcomeInfo.modelLabel}
					version={welcomeInfo.version}
					piAi={welcomeInfo.piAi}
				/>
			) : (
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
			)}
		</box>
	);
}
