/**
 * ChatPanel - Session 会话内容容器。
 *
 * 只组合 ConversationView 及其会话显示状态。Welcome、Sidebar、输入控制区和
 * Popup 均由 Workspace 管理，避免在 Chat 层混入顶层页面逻辑。
 *
 * 钻取模式：delegationView 非空时，切换渲染委派子任务的会话，
 * 按 ↑ 返回主会话（Workspace 负责状态切换）。
 */

import { ConversationView } from "../../components/chat/chat_panel/ConversationView";
import { DelegationSessionView } from "../../components/chat/chat_panel/DelegationSessionView";
import type {
	ConversationTurn,
	DelegationSessionView as DelegationSessionData,
} from "../../hooks/useAgent";

// #region Props

export interface ChatPanelProps {
	conversationTurns: ConversationTurn[];
	detailExpanded: boolean;
	scrollBottomSignal?: number;
	/** 钻取视图：非空时渲染子任务会话而非主会话。 */
	delegationView?: DelegationSessionData | null;
	/** 点击委派任务行钻取子会话 */
	onOpenTask?: (taskId: string) => void;
}

// #endregion

// #region Session 会话

export function ChatPanel({
	conversationTurns,
	detailExpanded,
	scrollBottomSignal,
	delegationView,
	onOpenTask,
}: ChatPanelProps) {
	if (delegationView) {
		return (
			<DelegationSessionView
				view={delegationView}
				detailExpanded={detailExpanded}
			/>
		);
	}
	return (
		<ConversationView
			conversationTurns={conversationTurns}
			detailExpanded={detailExpanded}
			scrollBottomSignal={scrollBottomSignal}
			onOpenTask={onOpenTask}
		/>
	);
}

// #endregion
