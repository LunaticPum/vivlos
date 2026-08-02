/** 当前 Session 的 Todo List 读取、覆写、内容修改和单向状态更新 Tool。 */

import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type {
	TodoItem,
	TodoList,
	TodoPriority,
} from "@vivlos/infra/eventbus/index.ts";
import { ToolError } from "@vivlos/shared";
import type { AdvancedToolDeps } from "../index.ts";
import { description } from "./description.ts";
import {
	deleteTodoList,
	MAX_TODO_ITEMS,
	normalizeTodoList,
	readTodoList,
	writeTodoList,
	type TodoStorageResult,
} from "./storage.ts";

// #region Tool 参数

/** Todo priority 的 Tool 参数 schema。 */
const Priority = Type.Union([
	Type.Literal("high"),
	Type.Literal("medium"),
	Type.Literal("low"),
]);

/** read operation 参数。 */
const Read = Type.Object({
	operation: Type.Literal("read"),
}, { additionalProperties: false });

/** write 中不带顺序号和状态的初始 Item 参数。 */
const WriteItem = Type.Object(
	{
		content: Type.String({ description: "任务内容" }),
		priority: Type.Optional(Priority),
	},
	{ additionalProperties: false },
);

/** 完整 List 的有序初始 Item。 */
const CompleteItems = Type.Array(WriteItem, {
	description: "按执行顺序排列的完整 Item List",
	minItems: 1,
	maxItems: MAX_TODO_ITEMS,
});

/** 创建新 Todo List。 */
const Write = Type.Object(
	{
		operation: Type.Literal("write"),
		description: Type.String({ description: "List 描述" }),
		items: CompleteItems,
	},
	{ additionalProperties: false },
);

/** 完整替换已有 Todo List。 */
const Replace = Type.Object(
	{
		operation: Type.Literal("replace"),
		description: Type.String({ description: "新的 List 描述" }),
		items: CompleteItems,
	},
	{ additionalProperties: false },
);

/** 删除当前 Todo List。 */
const Delete = Type.Object(
	{ operation: Type.Literal("delete") },
	{ additionalProperties: false },
);

/** 修改 Item 内容和 priority。 */
const ModifyEdit = Type.Object(
	{
		operation: Type.Literal("modify"),
		action: Type.Literal("edit"),
		orderNum: Type.Integer({ description: "Item 当前顺序号", minimum: 1 }),
		content: Type.Optional(Type.String({ description: "新的任务内容" })),
		priority: Type.Optional(Type.Union([Priority, Type.Null()])),
	},
	{ additionalProperties: false },
);

/** 在完整 List 中移动一个 Item。 */
const ModifyMove = Type.Object(
	{
		operation: Type.Literal("modify"),
		action: Type.Literal("move"),
		orderNum: Type.Integer({ description: "Item 当前顺序号", minimum: 1 }),
		toOrderNum: Type.Integer({ description: "移动后的最终顺序号", minimum: 1 }),
	},
	{ additionalProperties: false },
);

/** 在完整 List 中插入一个 pending Item。 */
const ModifyInsert = Type.Object(
	{
		operation: Type.Literal("modify"),
		action: Type.Literal("insert"),
		atOrderNum: Type.Integer({ description: "插入后的最终顺序号", minimum: 1 }),
		content: Type.String({ description: "新任务内容" }),
		priority: Type.Optional(Priority),
	},
	{ additionalProperties: false },
);

/** 从完整 List 中删除一个 Item。 */
const ModifyDelete = Type.Object(
	{
		operation: Type.Literal("modify"),
		action: Type.Literal("delete"),
		orderNum: Type.Integer({ description: "Item 当前顺序号", minimum: 1 }),
	},
	{ additionalProperties: false },
);

/** modify operation 的四种 Item 级动作。 */
const Modify = Type.Union([
	ModifyEdit,
	ModifyMove,
	ModifyInsert,
	ModifyDelete,
]);

/** update operation 参数；只允许声明单向状态变化。 */
const Update = Type.Object(
	{
		operation: Type.Literal("update"),
		orderNum: Type.Integer({ description: "Item 当前顺序号", minimum: 1 }),
		status: Type.Union([
			Type.Literal("in_progress"),
			Type.Literal("completed"),
		]),
	},
	{ additionalProperties: false },
);

/** Todo Tool 的 operation 参数联合。 */
const Params = Type.Union([Read, Write, Replace, Delete, Modify, Update]);
type Params = Static<typeof Params>;
type Operation = Params["operation"];

/** Todo Tool 提供给 Tool Log 的结构化详情。 */
export interface TodoToolDetails {
	readonly operation: Operation;
	readonly message: string;
	readonly todoList: TodoList | null;
}

// #endregion

// #region Tool 主入口

/** 创建绑定当前 Session 和 EventBus 的 Todo Tool。 */
export function createTodoTool(
	deps: AdvancedToolDeps,
): AgentTool<typeof Params, TodoToolDetails> {
	return {
		name: "todo",
		description,
		label: "Todo 列表",
		parameters: Params,
		prepareArguments: prepareTodoArguments,
		executionMode: "sequential",
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<TodoToolDetails>> {
			const sessionId = deps.getSessionId();
			const sessionDir = deps.getSessionDir();

			switch (params.operation) {
				case "read":
					return executeRead(sessionDir);
				case "write":
					return executeWrite(deps, sessionId, sessionDir, params);
				case "replace":
					return executeReplace(deps, sessionId, sessionDir, params);
				case "delete":
					return executeDelete(deps, sessionId, sessionDir);
				case "modify":
					return executeModify(deps, sessionId, sessionDir, params);
				case "update":
					return executeUpdate(deps, sessionId, sessionDir, params);
			}
		},
	};
}

// #endregion

// #region Operation 实现

/** 读取当前 Session 的完整 Todo List。 */
function executeRead(
	sessionDir: string,
): AgentToolResult<TodoToolDetails> {
	const todoList = unwrap(readTodoList(sessionDir));
	return success("read", todoList, todoList
		? `读取 ${todoList.items.length} 条 Todo Item`
		: "当前 Session 没有 Todo List");
}

/** 创建一个新的 Todo List。 */
function executeWrite(
	deps: AdvancedToolDeps,
	sessionId: string,
	sessionDir: string,
	params: Static<typeof Write>,
): AgentToolResult<TodoToolDetails> {
	if (unwrap(readTodoList(sessionDir))) {
		throw toolError("当前 Session 已有 Todo List，请使用 replace");
	}
	return persistNewList(deps, sessionId, sessionDir, "write", params);
}

/** 完整替换已有 Todo List。 */
function executeReplace(
	deps: AdvancedToolDeps,
	sessionId: string,
	sessionDir: string,
	params: Static<typeof Replace>,
): AgentToolResult<TodoToolDetails> {
	requiredList(sessionDir);
	return persistNewList(deps, sessionId, sessionDir, "replace", params);
}

/** 将输入规范化为全新的 pending List 并持久化。 */
function persistNewList(
	deps: AdvancedToolDeps,
	sessionId: string,
	sessionDir: string,
	operation: "write" | "replace",
	params: Static<typeof Write> | Static<typeof Replace>,
): AgentToolResult<TodoToolDetails> {
	const items: TodoItem[] = params.items.map((item, index) => ({
		orderNum: index + 1,
		content: item.content,
		status: "pending",
		...(item.priority === undefined ? {} : { priority: item.priority }),
	}));
	const normalized = unwrap(normalizeTodoList(params.description, items));
	const todoList = unwrap(writeTodoList(sessionDir, normalized));
	emitUpdated(deps, sessionId, todoList);
	return success(
		operation,
		todoList,
		`${operation === "write" ? "已创建" : "已替换"} ${todoList.items.length} 条 Todo Item`,
	);
}

/** 删除整个 Todo List。 */
function executeDelete(
	deps: AdvancedToolDeps,
	sessionId: string,
	sessionDir: string,
): AgentToolResult<TodoToolDetails> {
	const deleted = unwrap(deleteTodoList(sessionDir));
	if (deleted) emitUpdated(deps, sessionId, null);
	return success("delete", null, deleted
		? "已删除当前 Todo List"
		: "当前 Session 没有 Todo List");
}

/** 兼容少数模型把 write/replace items 数组序列化为 JSON 字符串的情况。 */
function prepareTodoArguments(args: unknown): Params {
	if (
		!isObject(args) ||
		(args.operation !== "write" && args.operation !== "replace") ||
		typeof args.items !== "string"
	) {
		return args as Params;
	}

	try {
		const items = JSON.parse(args.items);
		return Array.isArray(items) ? { ...args, items } as Params : args as Params;
	} catch {
		return args as Params;
	}
}

/** 判断解析后的 JSON 值是否为普通对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 对当前完整 List 执行一个 Item 级修改。 */
function executeModify(
	deps: AdvancedToolDeps,
	sessionId: string,
	sessionDir: string,
	params: Static<typeof Modify>,
): AgentToolResult<TodoToolDetails> {
	const current = requiredList(sessionDir);
	let items: TodoItem[];
	let message: string;

	switch (params.action) {
		case "edit": {
			const item = requiredItem(current, params.orderNum);
			if (item.status === "completed") {
				throw toolError(`Todo Item ${params.orderNum} 已终止，不能再编辑`);
			}
			const hasContent = params.content !== undefined;
			const hasPriority = params.priority !== undefined;
			if (!hasContent && !hasPriority) {
				throw toolError("modify edit 至少需要 content 或 priority 中的一项");
			}
			items = current.items.map((candidate) => candidate.orderNum === item.orderNum
				? {
					...candidate,
					...(hasContent ? { content: params.content! } : {}),
					...(hasPriority
						? params.priority === null
							? { priority: undefined }
							: { priority: params.priority }
						: {}),
				}
				: candidate);
			message = `已编辑 Todo Item ${params.orderNum}`;
			break;
		}
		case "move": {
			requiredItem(current, params.orderNum);
			if (params.toOrderNum > current.items.length) {
				throw toolError(`toOrderNum 必须在 1..${current.items.length} 之间`);
			}
			items = [...current.items];
			const [moved] = items.splice(params.orderNum - 1, 1);
			items.splice(params.toOrderNum - 1, 0, moved!);
			message = `已移动 Todo Item ${params.orderNum} 到位置 ${params.toOrderNum}`;
			break;
		}
		case "insert": {
			if (current.items.length >= MAX_TODO_ITEMS) {
				throw toolError(`Todo List 最多包含 ${MAX_TODO_ITEMS} 个 Item`);
			}
			if (params.atOrderNum > current.items.length + 1) {
				throw toolError(`atOrderNum 必须在 1..${current.items.length + 1} 之间`);
			}
			items = [...current.items];
			items.splice(params.atOrderNum - 1, 0, {
				orderNum: params.atOrderNum,
				content: params.content,
				status: "pending",
				...(params.priority === undefined ? {} : { priority: params.priority }),
			});
			message = `已在位置 ${params.atOrderNum} 插入 Todo Item`;
			break;
		}
		case "delete": {
			requiredItem(current, params.orderNum);
			if (current.items.length === 1) {
				unwrap(deleteTodoList(sessionDir));
				emitUpdated(deps, sessionId, null);
				return success(
					"modify",
					null,
					`已删除 Todo Item ${params.orderNum}；Todo List 已为空`,
				);
			}
			items = current.items.filter(
				(candidate) => candidate.orderNum !== params.orderNum,
			);
			message = `已删除 Todo Item ${params.orderNum}`;
			break;
		}
	}

	const next = unwrap(normalizeTodoList(current.description, items));
	if (sameItems(current.items, next.items)) {
		return success("modify", current, "Todo List 没有变化");
	}

	const todoList = unwrap(writeTodoList(sessionDir, next));
	emitUpdated(deps, sessionId, todoList);
	return success("modify", todoList, message);
}

/** 按单向状态机更新一个 Todo Item。 */
function executeUpdate(
	deps: AdvancedToolDeps,
	sessionId: string,
	sessionDir: string,
	params: Static<typeof Update>,
): AgentToolResult<TodoToolDetails> {
	const current = requiredList(sessionDir);
	const item = requiredItem(current, params.orderNum);
	const requestedStatus = params.status;
	validateTransition(current, item, requestedStatus);

	const items = current.items.map((candidate) => candidate.orderNum === item.orderNum
		? { ...candidate, status: requestedStatus }
		: candidate);
	const next = unwrap(normalizeTodoList(current.description, items));
	const todoList = unwrap(writeTodoList(sessionDir, next));
	emitUpdated(deps, sessionId, todoList);
	return success(
		"update",
		todoList,
		`Todo Item ${params.orderNum} 已更新为 ${requestedStatus}`,
	);
}

// #endregion

// #region 状态与顺序规则

/** 返回必须存在的 Todo List，并把读取失败转换为 ToolError。 */
function requiredList(sessionDir: string): TodoList {
	const todoList = unwrap(readTodoList(sessionDir));
	if (!todoList) throw toolError("当前 Session 没有 Todo List，请先调用 write");
	return todoList;
}

/** 返回指定顺序号的 Item。 */
function requiredItem(todoList: TodoList, orderNum: number): TodoItem {
	const item = todoList.items.find((candidate) => candidate.orderNum === orderNum);
	if (!item) throw toolError(`Todo Item ${orderNum} 不存在`);
	return item;
}

/** 校验 update 是否符合 Todo Item 单向状态机。 */
function validateTransition(
	todoList: TodoList,
	item: TodoItem,
	requested: Static<typeof Update>["status"],
): void {
	if (item.status === "completed") {
		throw toolError(`Todo Item ${item.orderNum} 已终止，不能再更新状态`);
	}

	if (item.status === "pending") {
		if (requested === "completed") return;
		if (todoList.inProgressOrderNum !== undefined) {
			throw toolError(`Todo Item ${todoList.inProgressOrderNum} 仍在执行，请先完成或取消它`);
		}
		if (todoList.pendingList?.[0]?.orderNum !== item.orderNum) {
			throw toolError(`Todo Item ${item.orderNum} 不是当前执行顺序中的第一条 pending Item`);
		}
		return;
	}

	if (requested !== "completed") {
		throw toolError("in_progress Item 只能更新为 completed");
	}
}

/** 比较两个 canonical Item 数组是否具有相同内容和顺序。 */
function sameItems(
	left: readonly TodoItem[],
	right: readonly TodoItem[],
): boolean {
	return left.length === right.length && left.every((item, index) => {
		const other = right[index];
		return other !== undefined &&
			item.orderNum === other.orderNum &&
			item.content === other.content &&
			item.status === other.status &&
			item.priority === other.priority;
	});
}

// #endregion

// #region Event 与返回结果

/** 在持久化成功后发送当前 Session 的完整 Todo 状态。 */
function emitUpdated(
	deps: AdvancedToolDeps,
	sessionId: string,
	todoList: TodoList | null,
): void {
	deps.eventBus.emit({
		type: "todo:updated",
		sessionId,
		todoList,
	});
}

/** 将 Storage Result 的错误边界转换为 Agent ToolError。 */
function unwrap<TValue>(result: TodoStorageResult<TValue>): TValue {
	if (!result.ok) throw toolError(result.error.message, result.error);
	return result.value;
}

/** 创建会被 pi-agent-core 记录为失败的 Todo ToolError。 */
function toolError(message: string, cause?: Error): ToolError {
	return new ToolError(message, "todo", cause);
}

/** 构造提供给模型和 Tool Log 的统一成功结果。 */
function success(
	operation: Operation,
	todoList: TodoList | null,
	message: string,
): AgentToolResult<TodoToolDetails> {
	const output = {
		operation,
		state: todoList?.status ?? "missing",
		todoList,
	};
	return {
		content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
		details: { operation, message, todoList },
	};
}

// #endregion
