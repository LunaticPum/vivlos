/**
 * SidebarTodo - 当前 Session 的只读 Todo 概览。
 *
 * 数据由 Workspace 注入；组件只派生并展示当前状态，不读取文件或 EventBus。
 */

import { useEffect, useRef, useState } from "react";
import { MouseButton, type MouseEvent } from "@opentui/core";
import type {
	TodoItem,
	TodoList,
	TodoListStatus,
} from "@vivlos/infra/eventbus/index.ts";
import stringWidth from "string-width";

const C = {
	text: "#a5adcb", // Macchiato/Subtext 0
	muted: "#8087a2", // Macchiato/Overlay 1
	background: "#1e2030", // Macchiato/Mantle
	activeBackground: "#181926", // Macchiato/Crust
	title: "#f5bde6", // Macchiato/Pink
	success: "#a6da95", // Macchiato/Green
} as const;
const MAX_ITEMS = 10;
const MAX_VIEWPORT_HEIGHT = 8;
const TODO_TEXT_WIDTH = 36;
const DESCRIPTION_TEXT_WIDTH = 38;
const ELLIPSIS = "...";
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// #region Types

export interface SidebarTodoProps {
	readonly sessionId: string;
	readonly todoList: TodoList | null;
	readonly active: boolean;
	readonly onActiveChange: (active: boolean) => void;
}

// #endregion

// #region Todo Overview

export function SidebarTodo({
	sessionId,
	todoList,
	active,
	onActiveChange,
}: SidebarTodoProps) {
	const visibleTodos = todoList?.items.slice(0, MAX_ITEMS) ?? [];
	const currentOrderNum = todoList?.inProgressOrderNum ??
		todoList?.pendingList?.[0]?.orderNum;
	const [expanded, setExpanded] = useState(visibleTodos.length > 0);
	const toggledRef = useRef(false);

	useEffect(() => {
		toggledRef.current = false;
		setExpanded(visibleTodos.length > 0);
	}, [sessionId]);

	useEffect(() => {
		if (!toggledRef.current && visibleTodos.length > 0) setExpanded(true);
	}, [visibleTodos.length]);

	const activate = (event: MouseEvent) => {
		if (event.button !== MouseButton.LEFT) return;
		onActiveChange(true);
	};

	const toggle = (event: MouseEvent) => {
		if (event.button !== MouseButton.LEFT || visibleTodos.length === 0) return;
		toggledRef.current = true;
		setExpanded((current) => !current);
	};

	const completed = visibleTodos.filter((todo) => todo.status === "completed").length;
	const viewportHeight = Math.min(
		visibleTodos.length * 2,
		MAX_VIEWPORT_HEIGHT,
	);

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
				<text fg={C.title}>TODO</text>
				<box flexGrow={1} />
				<box flexDirection="row">
					<text fg={listStatusColor(todoList?.status)}>
						{todoList?.status ?? "none"}{" "}
					</text>
					<text fg={C.muted}>{completed}/{visibleTodos.length}</text>
					{visibleTodos.length > 0 && (
						<text fg={C.muted}>{expanded ? " ▾" : " ▸"}</text>
					)}
				</box>
			</box>

			{expanded && visibleTodos.length > 0 && (
				<>
					<text width="100%" height={1} fg={C.muted}>
						{formatSingleLine(todoList?.description ?? "", DESCRIPTION_TEXT_WIDTH)}
					</text>
					<box height={1} />
					<scrollbox
						width="100%"
						height={viewportHeight}
						maxHeight={MAX_VIEWPORT_HEIGHT}
						minHeight={2}
						flexShrink={1}
						scrollY={true}
						verticalScrollbarOptions={{ visible: false }}
					>
						{visibleTodos.map((todo) => (
							<TodoRow
								key={todo.orderNum}
								todo={todo}
								current={todo.orderNum === currentOrderNum}
							/>
						))}
					</scrollbox>
				</>
			)}
		</box>
	);
}

// #endregion

// #region Todo Item

function TodoRow({ todo, current }: { todo: TodoItem; current: boolean }) {
	const status = getStatusStyle(todo.status);
	const [firstLine, secondLine] = formatTodoLines(todo.content);
	const textColor = current
		? C.title
		: todo.status === "completed"
			? C.muted
			: C.text;

	return (
		<box width="100%" height={2} flexDirection="column">
			<box width="100%" height={1} flexDirection="row">
				<text width={2} fg={status.color}>{status.icon}</text>
				<text fg={textColor}>{firstLine}</text>
			</box>
			<box width="100%" height={1} flexDirection="row">
				<text width={2}> </text>
				<text fg={textColor}>{secondLine}</text>
			</box>
		</box>
	);
}

/** 将 List description 收敛为 Sidebar 中的一行安全宽度。 */
function formatSingleLine(content: string, maxWidth: number): string {
	const normalized = content.replace(/\s+/g, " ").trim();
	const graphemes = Array.from(segmenter.segment(normalized), (item) => item.segment);
	const line = takeLine(graphemes, 0, maxWidth);
	if (line.next >= graphemes.length) return line.text;
	const truncated = takeLine(graphemes, 0, maxWidth - stringWidth(ELLIPSIS));
	return `${truncated.text}${ELLIPSIS}`;
}

function formatTodoLines(content: string): readonly [string, string] {
	const normalized = content.replace(/\s+/g, " ").trim();
	const graphemes = Array.from(segmenter.segment(normalized), (item) => item.segment);
	const first = takeLine(graphemes, 0, TODO_TEXT_WIDTH);
	if (first.next >= graphemes.length) return [first.text, ""];

	const second = takeLine(graphemes, first.next, TODO_TEXT_WIDTH);
	if (second.next >= graphemes.length) return [first.text, second.text];

	const truncated = takeLine(
		graphemes,
		first.next,
		TODO_TEXT_WIDTH - stringWidth(ELLIPSIS),
	);
	return [first.text, `${truncated.text}${ELLIPSIS}`];
}

function takeLine(
	graphemes: readonly string[],
	start: number,
	maxWidth: number,
): { text: string; next: number } {
	let next = start;
	while (graphemes[next] === " ") next++;
	let text = "";
	while (next < graphemes.length) {
		const candidate = text + graphemes[next];
		if (stringWidth(candidate) > maxWidth) break;
		text = candidate;
		next++;
	}
	return { text: text.trimEnd(), next };
}

function getStatusStyle(status: TodoItem["status"]): { icon: string; color: string } {
	switch (status) {
		case "pending":
			return { icon: "○", color: C.muted };
		case "in_progress":
			return { icon: "◉", color: C.title };
		case "completed":
			return { icon: "✓", color: C.success };
	}
}

/** Todo List 状态对应 Header 中的只读展示颜色。 */
function listStatusColor(status: TodoListStatus | undefined): string {
	if (status === "completed") return C.success;
	if (status === "active") return C.title;
	return C.muted;
}

// #endregion
