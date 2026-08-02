/**
 * ChatPanel - Session 会话内容容器。
 *
 * 只组合 ConversationView 及其会话显示状态。Welcome、Sidebar、输入控制区和
 * Popup 均由 Workspace 管理，避免在 Chat 层混入顶层页面逻辑。
 */

import { ConversationView } from "../../components/chat/chat_panel/ConversationView";
import type { ConversationTurn } from "../../hooks/useAgent";

// #region Props

export interface ChatPanelProps {
	conversationTurns: ConversationTurn[];
	detailExpanded: boolean;
}

// #endregion

// #region Session 会话

export function ChatPanel({
	conversationTurns,
	detailExpanded,
}: ChatPanelProps) {
	return (
		<ConversationView
			conversationTurns={conversationTurns}
			detailExpanded={detailExpanded}
		/>
	);
}

// #endregion
