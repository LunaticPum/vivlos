/**
 * task tool -- 跨 session 长期目标管理（增量 CRUD）
 *
 * 与 todo 不同：task 跨 session 持久化，新 session 里 agent 不知道完整列表，
 * 全量替换不现实，因此用增量操作（create / list / complete / update）。
 *
 * 存储：~/.vivlos/tasks/<listName>.json + .active 文件
 * 支持多个 task list，用户可在 TUI 侧边栏切换 active list。
 * 写入后 emit task:* 事件，驱动 SideBar 刷新。
 */

import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { shortId } from "@vivlos/shared/utils/id.ts";
import type { TaskItem } from "@vivlos/infra/eventbus/index.ts";
import type { AdvancedToolDeps } from "../index.ts";
import { description } from "./description.ts";

/** 一个 task list 的完整结构 */
interface TaskList {
	name: string;
	tasks: TaskItem[];
	createdAt: number;
	updatedAt: number;
}

/** 读取指定 task list，不存在返回 null */
function readTaskList(tasksDir: string, listName: string): TaskList | null {
	const filePath = resolve(tasksDir, `${listName}.json`);
	if (!existsSync(filePath)) return null;
	return JSON.parse(readFileSync(filePath, "utf-8")) as TaskList;
}

/** 写入 task list（自动创建目录） */
function writeTaskList(tasksDir: string, list: TaskList): void {
	mkdirSync(tasksDir, { recursive: true });
	writeFileSync(
		resolve(tasksDir, `${list.name}.json`),
		JSON.stringify(list, null, 2),
		"utf-8",
	);
}

/** 读取当前 active list 名称（.active 文件，默认 "default"） */
function getActiveListName(tasksDir: string): string {
	const activePath = join(tasksDir, ".active");
	if (!existsSync(activePath)) return "default";
	return readFileSync(activePath, "utf-8").trim() || "default";
}

/** 获取或创建 task list（不存在时初始化空列表） */
function ensureTaskList(tasksDir: string, listName: string): TaskList {
	const existing = readTaskList(tasksDir, listName);
	if (existing) return existing;
	const now = Date.now();
	return { name: listName, tasks: [], createdAt: now, updatedAt: now };
}

const Params = Type.Object({
	action: Type.Union(
		[
			Type.Literal("create"),
			Type.Literal("list"),
			Type.Literal("complete"),
			Type.Literal("update"),
		],
		{ description: "操作类型" },
	),
	title: Type.Optional(
		Type.String({ description: "目标标题（create/update 时用）" }),
	),
	description: Type.Optional(
		Type.String({ description: "目标描述（create/update 时可选）" }),
	),
	id: Type.Optional(
		Type.String({ description: "目标 ID（complete/update 时必填）" }),
	),
	status: Type.Optional(
		Type.Union(
			[
				Type.Literal("pending"),
				Type.Literal("in_progress"),
				Type.Literal("completed"),
			],
			{ description: "新状态（update 时可选）" },
		),
	),
});

type Params = Static<typeof Params>;

export function createTaskTool(
	deps: AdvancedToolDeps,
): AgentTool<typeof Params, { message: string }> {
	return {
		name: "task",
		description,
		label: "长期目标",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<{ message: string }>> {
			const { tasksDir, eventBus } = deps;
			const listName = getActiveListName(tasksDir);
			const list = ensureTaskList(tasksDir, listName);

			switch (params.action) {
				case "create": {
					if (!params.title) {
						return {
							content: [{ type: "text", text: "错误：create 操作需要 title 参数" }],
							details: { message: "缺少 title" },
						};
					}
					const task: TaskItem = {
						id: shortId(),
						title: params.title,
						description: params.description,
						status: "pending",
						createdAt: Date.now(),
					};
					list.tasks.push(task);
					list.updatedAt = Date.now();
					writeTaskList(tasksDir, list);
					eventBus.emit({ type: "task:created", listName, task });
					return {
						content: [{ type: "text", text: `已创建目标 [${task.id}]：${task.title}` }],
						details: { message: `已创建：${task.title}` },
					};
				}

				case "list": {
					const text =
						list.tasks.length === 0
							? `目标列表 "${listName}" 为空。`
							: list.tasks
									.map((t) => {
										const icon =
											t.status === "completed"
												? "[x]"
												: t.status === "in_progress"
													? "[-]"
													: "[ ]";
										return `${icon} ${t.id}: ${t.title}${t.description ? ` - ${t.description}` : ""}`;
									})
									.join("\n");
					return {
						content: [{ type: "text", text }],
						details: { message: `"${listName}" 共 ${list.tasks.length} 条目标` },
					};
				}

				case "complete": {
					if (!params.id) {
						return {
							content: [{ type: "text", text: "错误：complete 操作需要 id 参数" }],
							details: { message: "缺少 id" },
						};
					}
					const task = list.tasks.find((t) => t.id === params.id);
					if (!task) {
						return {
							content: [{ type: "text", text: `错误：未找到目标 ${params.id}` }],
							details: { message: "未找到" },
						};
					}
					(task as { status: TaskItem["status"]; completedAt: number }).status = "completed";
					(task as { completedAt: number }).completedAt = Date.now();
					list.updatedAt = Date.now();
					writeTaskList(tasksDir, list);
					eventBus.emit({ type: "task:completed", listName, taskId: params.id });
					return {
						content: [{ type: "text", text: `已完成目标 [${task.id}]：${task.title}` }],
						details: { message: `已完成：${task.title}` },
					};
				}

				case "update": {
					if (!params.id) {
						return {
							content: [{ type: "text", text: "错误：update 操作需要 id 参数" }],
							details: { message: "缺少 id" },
						};
					}
					const task = list.tasks.find((t) => t.id === params.id);
					if (!task) {
						return {
							content: [{ type: "text", text: `错误：未找到目标 ${params.id}` }],
							details: { message: "未找到" },
						};
					}
					// 只更新传入的字段
					const mutable = task as {
						title: string;
						description?: string;
						status: TaskItem["status"];
					};
					if (params.title) mutable.title = params.title;
					if (params.description !== undefined) mutable.description = params.description;
					if (params.status) mutable.status = params.status;
					list.updatedAt = Date.now();
					writeTaskList(tasksDir, list);
					eventBus.emit({ type: "task:updated", listName, task });
					return {
						content: [{ type: "text", text: `已更新目标 [${task.id}]：${task.title}` }],
						details: { message: `已更新：${task.title}` },
					};
				}
			}
		},
	};
}
