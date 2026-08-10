/**
 * DelegationSessionView - 委派子任务会话钻取视图。
 *
 * 点击委派卡片中的任务行后，会话页切换渲染该子任务的会话消息；
 * 按 ↑ 返回主会话（由 InputBar 截获）。
 * 复用 messagesToTurns + AgentMessageCard，与主会话渲染完全一致。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import spinners from "cli-spinners";
import type { ScrollAcceleration, ScrollBoxRenderable } from "@opentui/core";
import { AgentMessageCard } from "./AgentMessageCard";
import { UserMessageCard } from "./UserMessageCard";
import {
	messagesToTurns,
	type DelegationSessionView as DelegationSessionData,
} from "../../../hooks/useAgent";

const SPINNER = spinners.dots7;
const SPINNER_INTERVAL = 80;

const C = {
	text: "#cdd6f4",
	subtext: "#bac2de",
	muted: "#6c7086",
	bright: "#f5c2e7",
	exploring: "#89dceb",
	writing: "#fab387",
	divider: "#6c7086",
} as const;

const FAST_SCROLL: ScrollAcceleration = {
	tick: () => 3,
	reset: () => {},
};

export interface DelegationSessionViewProps {
	view: DelegationSessionData;
	detailExpanded: boolean;
}

export function DelegationSessionView({
	view,
	detailExpanded,
}: DelegationSessionViewProps) {
	const turns = useMemo(
		() => {
			// 防御：子会话消息来自运行时快照，任何异常形状都不应导致整棵树崩溃
			try {
				return messagesToTurns(view.messages);
			} catch {
				return [];
			}
		},
		[view.messages],
	);
	const scrollboxRef = useRef<ScrollBoxRenderable>(null);
	const spin = useSpinnerFrame(view.running);

	// 与主会话滚动区相同：禁用聚焦，避免抢走输入框焦点
	useEffect(() => {
		if (scrollboxRef.current) scrollboxRef.current.focusable = false;
	}, []);

	const kindTag = view.kind === "exploring" ? "[Exploring]" : "[Writing]";
	const kindColor = view.kind === "exploring" ? C.exploring : C.writing;

	return (
		<box flexGrow={1} flexDirection="column" overflow="hidden">
			<box paddingX={3} flexDirection="column">
				<box flexDirection="row">
					<text fg={kindColor}>{kindTag}</text>
					<text fg={C.bright}>{` ${view.title} `}</text>
					<text fg={view.running ? C.subtext : C.muted}>
						{view.running ? `· ${spin} 运行中` : "· 已结束"}
					</text>
					<box flexGrow={1} />
					<text fg={C.muted}>↑ 返回主会话</text>
				</box>
				<box
					flexGrow={1}
					height={1}
					marginTop={1}
					border={["top"]}
					borderColor={C.divider}
				/>
			</box>
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
					{turns.map((convTurn, i) => (
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

/** spinner 纯文本帧 */
function useSpinnerFrame(active: boolean): string {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		if (!active) return;
		const timer = setInterval(
			() => setFrame((f) => (f + 1) % SPINNER.frames.length),
			SPINNER_INTERVAL,
		);
		return () => clearInterval(timer);
	}, [active]);
	return SPINNER.frames[frame]!;
}
