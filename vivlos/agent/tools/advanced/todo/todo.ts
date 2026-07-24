/**
 * todo tool -- session 级短期任务管理（全量替换）
 *
 * 参照 opencode todowrite 设计：
 * - agent 每次传入完整列表，全量替换（不做增量操作）
 * - 列表小（3-7 项），全量发送无负担，避免 state 同步问题
 * - 存储：~/.vivlos/sessions/<sessionId>/todos.json
 * - 写入后 emit todo:updated 事件，驱动 SideBar 刷新
 */

import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { TodoItem } from "@vivlos/infra/eventbus/index.ts";
import type { AdvancedToolDeps } from "../index.ts";
import { description } from "./description.ts";

const TodoSchema = Type.Object({
	content: Type.String({ description: "任务描述" }),
	status: Type.Union(
		[
			Type.Literal("pending"),
			Type.Literal("in_progress"),
			Type.Literal("completed"),
			Type.Literal("cancelled"),
		],
		{ description: "任务状态" },
	),
	priority: Type.Optional(
		Type.Union(
			[Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")],
			{ description: "优先级（可选）" },
		),
	),
});

const Params = Type.Object({
	todos: Type.Array(TodoSchema, { description: "完整的 todo 列表（全量替换）" }),
});

type Params = Static<typeof Params>;

export function createTodoTool(deps: AdvancedToolDeps): AgentTool<typeof Params, { message: string }> {
	return {
		name: "todo",
		description,
		label: "Todo 列表",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<{ message: string }>> {
			const sessionDir = deps.getSessionDir();
			mkdirSync(sessionDir, { recursive: true });

			const todos: TodoItem[] = params.todos;
			const filePath = resolve(sessionDir, "todos.json");
			writeFileSync(filePath, JSON.stringify(todos, null, 2), "utf-8");

			// 通知 TUI 层刷新 SideBar
			deps.eventBus.emit({
				type: "todo:updated",
				sessionId: deps.getSessionId(),
				todos,
			});

			const pending = todos.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;
			return {
				content: [{ type: "text", text: JSON.stringify(todos, null, 2) }],
				details: { message: `${todos.length} 条 todo（${pending} 条活跃）` },
			};
		},
	};
}
