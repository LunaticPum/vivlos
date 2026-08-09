/**
 * Sidebar - 当前 Session 侧边栏容器。
 *
 * 只负责组装 Session、Memory、Todo 与工作目录，不包含领域展示逻辑。
 */

import stringWidth from "string-width";
import type { TodoList } from "@vivlos/infra/eventbus/index.ts";
import type { L2Overview } from "@vivlos/infra/storage/memory/index.ts";
import {
	SidebarMemory,
	type FilePreview,
} from "../../components/sideBar/SideBar_Memory";
import { SidebarSession } from "../../components/sideBar/SideBar_Session";
import { SidebarTodo } from "../../components/sideBar/SideBar_Todo";
import {
	SidebarTasks,
	type SidebarTaskEntry,
} from "../../components/sideBar/SideBar_Tasks";

const C = {
	secondary: "#a5adcb", // Macchiato/Subtext 0
	muted: "#8087a2", // Macchiato/Overlay 1
	background: "#1e2030", // Macchiato/Mantle
} as const;
const SIDEBAR_WIDTH = 42;
const CONTENT_WIDTH = 38;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// #region Types

export interface SidebarPreview {
	readonly sessionName: string;
	readonly sessionId: string;
	readonly titleGenerating: boolean;
	readonly path: string | null;
	readonly cwd: string;
	readonly memory: FilePreview | null;
	readonly user: FilePreview | null;
	readonly l2: L2Overview | null;
}

export interface SidebarProps {
	readonly preview: SidebarPreview;
	readonly todoList: TodoList | null;
	readonly delegateTasks: readonly SidebarTaskEntry[];
	readonly memoryActive: boolean;
	readonly todoActive: boolean;
	readonly tasksActive: boolean;
	readonly onMemoryActiveChange: (active: boolean) => void;
	readonly onTodoActiveChange: (active: boolean) => void;
	readonly onTasksActiveChange: (active: boolean) => void;
}

// #endregion

// #region Formatters

function trimPath(value: string, width: number): string {
	if (stringWidth(value) <= width) return value;
	const parts = Array.from(segmenter.segment(value), (item) => item.segment);
	let result = "";
	for (let index = parts.length - 1; index >= 0; index--) {
		const next = parts[index] + result;
		if (stringWidth(`...${next}`) > width) break;
		result = next;
	}
	return `...${result}`;
}

// #endregion

// #region Sidebar

export function Sidebar({
	preview,
	todoList,
	delegateTasks,
	memoryActive,
	todoActive,
	tasksActive,
	onMemoryActiveChange,
	onTodoActiveChange,
	onTasksActiveChange,
}: SidebarProps) {
	return (
		<box
			width={SIDEBAR_WIDTH}
			height="100%"
			flexShrink={0}
			flexDirection="column"
			backgroundColor={C.background}
			paddingY={1}
			overflow="hidden"
		>
			<box flexShrink={0}>
				<SidebarSession
					sessionName={preview.sessionName}
					sessionId={preview.sessionId}
					titleGenerating={preview.titleGenerating}
				/>
			</box>

			{/* #region Domain Overviews */}
			<box flexShrink={0}>
				<SidebarMemory
					active={memoryActive}
					onActiveChange={onMemoryActiveChange}
					preview={{
						sessionId: preview.sessionId,
						path: preview.path,
						memory: preview.memory,
						user: preview.user,
						l2: preview.l2,
					}}
				/>
			</box>
			<SidebarTodo
				sessionId={preview.sessionId}
				todoList={todoList}
				active={todoActive}
				onActiveChange={onTodoActiveChange}
			/>
			<SidebarTasks
				sessionId={preview.sessionId}
				tasks={delegateTasks}
				active={tasksActive}
				onActiveChange={onTasksActiveChange}
			/>
			{/* #endregion */}

			<box flexGrow={1} />

			{/* #region Working Directory */}
			<box paddingX={2} flexDirection="column" flexShrink={0}>
				<text fg={C.muted}>CWD</text>
				<text fg={C.secondary}>{trimPath(preview.cwd, CONTENT_WIDTH)}</text>
			</box>
			{/* #endregion */}
		</box>
	);
}

// #endregion
