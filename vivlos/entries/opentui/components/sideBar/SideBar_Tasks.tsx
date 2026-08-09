/**
 * SidebarTasks - 当前 Session 的委派任务概览（样式原型）。
 *
 * 数据由 Workspace 从 conversationTurns 派生注入；
 * 组件只派生并展示当前状态，不读取文件或 EventBus。
 */

import { useEffect, useRef, useState } from "react";
import { MouseButton, type MouseEvent } from "@opentui/core";
import type {
	DelegationBatchState,
	SubagentState,
	TaskKind,
} from "@vivlos/agent/delegation/types.ts";
import type { ConversationTurn } from "../../hooks/useAgent";

const C = {
	text: "#a5adcb", // Macchiato/Subtext 0
	muted: "#8087a2", // Macchiato/Overlay 1
	background: "#1e2030", // Macchiato/Mantle
	activeBackground: "#181926", // Macchiato/Crust
	title: "#f5bde6", // Macchiato/Pink
	success: "#a6da95", // Macchiato/Green
	abort: "#ed8796", // Macchiato/Red
	exploring: "#8bd5ca", // Macchiato/Teal
	writing: "#f5a97f", // Macchiato/Peach
} as const;
const MAX_VIEWPORT_HEIGHT = 8;

// #region Types

/** 侧边栏委派任务条目（从批次状态展平）。 */
export interface SidebarTaskEntry {
	readonly id: string;
	readonly kind: TaskKind;
	readonly title: string;
	readonly state: "running" | SubagentState;
	readonly turns: number;
}

export interface SidebarTasksProps {
	readonly sessionId: string;
	readonly tasks: readonly SidebarTaskEntry[];
	readonly active: boolean;
	readonly onActiveChange: (active: boolean) => void;
}

// #endregion

// #region 派生

/** 从会话轮次中展平所有委派任务（含历史重建的批次）。 */
export function deriveDelegateTasks(
	turns: readonly ConversationTurn[],
): SidebarTaskEntry[] {
	const entries: SidebarTaskEntry[] = [];
	for (const turn of turns) {
		for (const logEntry of turn.log) {
			if (logEntry.kind !== "tool" || logEntry.name !== "delegate") continue;
			const batch = logEntry.details as DelegationBatchState | undefined;
			if (!batch) continue;
			for (const task of batch.tasks) {
				entries.push({
					id: `${logEntry.callId}:${task.id}`,
					kind: task.kind,
					title: task.title,
					state: task.state,
					turns: task.turns,
				});
			}
		}
	}
	return entries;
}

// #endregion

// #region Tasks Overview

export function SidebarTasks({
	sessionId,
	tasks,
	active,
	onActiveChange,
}: SidebarTasksProps) {
	const [expanded, setExpanded] = useState(tasks.length > 0);
	const toggledRef = useRef(false);

	useEffect(() => {
		toggledRef.current = false;
		setExpanded(tasks.length > 0);
	}, [sessionId]);

	useEffect(() => {
		if (!toggledRef.current && tasks.length > 0) setExpanded(true);
	}, [tasks.length]);

	const activate = (event: MouseEvent) => {
		if (event.button !== MouseButton.LEFT) return;
		onActiveChange(true);
	};

	const toggle = (event: MouseEvent) => {
		if (event.button !== MouseButton.LEFT || tasks.length === 0) return;
		toggledRef.current = true;
		setExpanded((current) => !current);
	};

	const completed = tasks.filter((task) => task.state === "completed").length;
	const running = tasks.some((task) => task.state === "running");
	const viewportHeight = Math.min(tasks.length, MAX_VIEWPORT_HEIGHT);

	return (
		<box
			width="100%"
			flexDirection="column"
			flexShrink={1}
			minHeight={3}
			overflow="hidden"
			paddingX={2}
			paddingTop={1}
			paddingBottom={1}
			backgroundColor={active ? C.activeBackground : C.background}
			onMouseDown={activate}
		>
			<box width="100%" height={1} flexDirection="row" onMouseDown={toggle}>
				<text fg={C.title}>TASKS</text>
				<box flexGrow={1} />
				<box flexDirection="row">
					<text fg={running ? C.title : tasks.length > 0 ? C.success : C.muted}>
						{running ? "running " : tasks.length > 0 ? "done " : "none "}
					</text>
					<text fg={C.muted}>{completed}/{tasks.length}</text>
					{tasks.length > 0 && (
						<text fg={C.muted}>{expanded ? " ▾" : " ▸"}</text>
					)}
				</box>
			</box>

			{expanded && tasks.length > 0 && (
				<>
					<box height={1} />
					<scrollbox
						width="100%"
						height={viewportHeight}
						maxHeight={MAX_VIEWPORT_HEIGHT}
						minHeight={1}
						flexShrink={1}
						scrollY={true}
						verticalScrollbarOptions={{ visible: false }}
					>
						{tasks.map((task) => (
							<TaskRow key={task.id} task={task} />
						))}
					</scrollbox>
				</>
			)}
		</box>
	);
}

// #endregion

// #region Task Item

function TaskRow({ task }: { task: SidebarTaskEntry }) {
	const status = getStatusStyle(task.state);
	const kindColor = task.kind === "exploring" ? C.exploring : C.writing;
	const kindTag = task.kind === "exploring" ? "E" : "W";
	const textColor = task.state === "running"
		? C.text
		: task.state === "completed"
			? C.muted
			: task.state === "turn_limited"
				? C.text
				: C.abort;

	return (
		<box width="100%" height={1} flexDirection="row">
			<text width={2} fg={status.color}>{status.icon}</text>
			<text fg={kindColor}>{`[${kindTag}]`}</text>
			<text fg={textColor}>{` ${task.title}`}</text>
		</box>
	);
}

function getStatusStyle(
	state: SidebarTaskEntry["state"],
): { icon: string; color: string } {
	switch (state) {
		case "running":
			return { icon: "◉", color: C.title };
		case "completed":
			return { icon: "✓", color: C.success };
		case "turn_limited":
			return { icon: "◐", color: C.writing };
		case "timeout":
		case "aborted":
		case "error":
			return { icon: "✗", color: C.abort };
	}
}

// #endregion
