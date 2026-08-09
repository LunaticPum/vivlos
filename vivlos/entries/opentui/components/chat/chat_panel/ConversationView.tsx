/**
 * ConversationView - 会话内容滚动视图
 *
 * 遍历 conversationTurns，渲染 UserMessageCard + AgentMessageCard。
 * WelcomeScreen 由 Workspace 单独管理，本组件只负责会话内容。
 */

import { useEffect, useRef } from "react";
import { getColors } from "../../../designs/colors";
import { UserMessageCard } from "./UserMessageCard";
import { AgentMessageCard } from "./AgentMessageCard";
import type { ConversationTurn } from "../../../hooks/useAgent";
import type { ScrollAcceleration, ScrollBoxRenderable } from "@opentui/core";

const colors = getColors();

const FAST_SCROLL: ScrollAcceleration = {
	tick: () => 3,
	reset: () => {},
};

export interface ConversationViewProps {
	conversationTurns: ConversationTurn[];
	detailExpanded: boolean;
	/** 递增信号：变化时强制滚动到底部（发送消息时由 Workspace 触发） */
	scrollBottomSignal?: number;
}

export function ConversationView({
	conversationTurns,
	detailExpanded,
	scrollBottomSignal,
}: ConversationViewProps) {
	const scrollboxRef = useRef<ScrollBoxRenderable>(null);

	// scrollbox 默认可聚焦：鼠标点击聊天区会抢走焦点，
	// 之后 ↑↓ 会触发其内置键盘滚动，与输入框历史导航冲突。
	// 聊天区没有键盘滚动需求，禁用聚焦，焦点保持在输入框。
	useEffect(() => {
		if (scrollboxRef.current) scrollboxRef.current.focusable = false;
	}, []);

	// 发送消息信号：强制滚到底部（stickyScroll 只在已处于底部时跟随，
	// 用户上翻过历史后发送，需要显式拉回底部）
	useEffect(() => {
		if (!scrollBottomSignal) return;
		const sb = scrollboxRef.current;
		if (sb) sb.scrollTop = sb.scrollHeight;
	}, [scrollBottomSignal]);

	return (
		<box flexGrow={1} overflow="hidden">
			<box flexGrow={1} overflow="hidden" width="100%">
				<scrollbox
					ref={scrollboxRef}
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
							<UserMessageCard
								text={convTurn.userInput}
								attachedImages={convTurn.attachedImages}
							/>
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
