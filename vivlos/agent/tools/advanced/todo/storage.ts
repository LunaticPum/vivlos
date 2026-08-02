import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import type {
	TodoItem,
	TodoItemStatus,
	TodoList,
	TodoPriority,
} from "@vivlos/infra/eventbus/index.ts";
import { err, ok, toError, type Result } from "@vivlos/shared";

// #region 存储常量与类型

/** 单个 Session Todo List 允许的最大 Item 数。 */
export const MAX_TODO_ITEMS = 10;

/** Session 目录中的 Todo 持久化文件名。 */
const TODO_FILE_NAME = "todos.json";

/** 磁盘只保存 description 和完整 Item，不保存派生字段。 */
type PersistedTodoList = Pick<TodoList, "description" | "items">;

/** Todo Storage 使用的结构化成功或原生错误结果。 */
export type TodoStorageResult<TValue> = Result<TValue, Error>;

// #endregion

// #region 公共存储 API

/** 读取并严格校验当前 Session 的 Todo List；文件不存在时返回 null。 */
export function readTodoList(
	sessionDir: string,
): TodoStorageResult<TodoList | null> {
	const file = resolve(sessionDir, TODO_FILE_NAME);
	if (!existsSync(file)) return ok(null);

	try {
		const parsed = parsePersistedTodoList(JSON.parse(readFileSync(file, "utf-8")));
		if (!parsed.ok) return parsed;
		return normalizeTodoList(parsed.value.description, parsed.value.items);
	} catch (error) {
		return err(storageError("读取 Todo List 失败", error));
	}
}

/** 规范化并原子写入当前 Session 的 Todo List。 */
export function writeTodoList(
	sessionDir: string,
	todoList: TodoList,
): TodoStorageResult<TodoList> {
	const normalized = normalizeTodoList(todoList.description, todoList.items);
	if (!normalized.ok) return normalized;

	const file = resolve(sessionDir, TODO_FILE_NAME);
	const tempFile = resolve(sessionDir, `.todos.${randomUUID()}.tmp`);
	const persisted: PersistedTodoList = {
		description: normalized.value.description,
		items: normalized.value.items,
	};

	try {
		mkdirSync(sessionDir, { recursive: true });
		writeFileSync(tempFile, `${JSON.stringify(persisted, null, 2)}\n`, "utf-8");
		renameSync(tempFile, file);
		return normalized;
	} catch (error) {
		try {
			rmSync(tempFile, { force: true });
		} catch {
			// 保留原始写入错误；唯一临时文件不会被后续操作误用。
		}
		return err(storageError("写入 Todo List 失败", error));
	}
}

/** 删除当前 Session 的 Todo List；返回删除前文件是否存在。 */
export function deleteTodoList(
	sessionDir: string,
): TodoStorageResult<boolean> {
	const file = resolve(sessionDir, TODO_FILE_NAME);
	const existed = existsSync(file);
	if (!existed) return ok(false);

	try {
		rmSync(file);
		return ok(true);
	} catch (error) {
		return err(storageError("删除 Todo List 失败", error));
	}
}

// #endregion

// #region Todo List 标准化

/**
 * 校验 canonical Item，并统一生成连续 orderNum、pendingList、inProgressOrderNum 和 List status。
 */
export function normalizeTodoList(
	description: string,
	items: readonly TodoItem[],
): TodoStorageResult<TodoList> {
	const normalizedDescription = description.trim();
	if (!normalizedDescription) return err(new Error("Todo List description 不能为空"));
	if (items.length === 0) return err(new Error("Todo List 不能为空"));
	if (items.length > MAX_TODO_ITEMS) {
		return err(new Error(`Todo List 最多包含 ${MAX_TODO_ITEMS} 个 Item`));
	}

	const contents = new Set<string>();
	const normalizedItems: TodoItem[] = [];
	let inProgressOrderNum: number | undefined;

	for (const [index, item] of items.entries()) {
		if (!isItemStatus(item.status)) {
			return err(new Error(`Todo Item ${index + 1} 的 status 无效`));
		}
		if (!isPriority(item.priority)) {
			return err(new Error(`Todo Item ${index + 1} 的 priority 无效`));
		}

		const content = item.content.trim();
		if (!content) return err(new Error(`Todo Item ${index + 1} 的 content 不能为空`));
		if (contents.has(content)) {
			return err(new Error(`Todo Item content 不能重复: ${content}`));
		}
		contents.add(content);

		const orderNum = index + 1;
		if (item.status === "in_progress") {
			if (inProgressOrderNum !== undefined) {
				return err(new Error("Todo List 同时只能有一个 in_progress Item"));
			}
			inProgressOrderNum = orderNum;
		}

		normalizedItems.push({
			orderNum,
			content,
			status: item.status,
			...(item.priority === undefined ? {} : { priority: item.priority }),
		});
	}

	const pendingList = normalizedItems
		.filter((item) => item.status === "pending")
		.map((item) => ({
			orderNum: item.orderNum,
			...(item.priority === undefined ? {} : { priority: item.priority }),
		}));
	const status = pendingList.length > 0 || inProgressOrderNum !== undefined
		? "active"
		: "completed";

	return ok({
		description: normalizedDescription,
		status,
		...(pendingList.length === 0 ? {} : { pendingList }),
		...(inProgressOrderNum === undefined ? {} : { inProgressOrderNum }),
		items: normalizedItems,
	});
}

// #endregion

// #region 持久化解析

/** 将未知 JSON 严格解析为最小持久化 Todo 结构。 */
function parsePersistedTodoList(value: unknown): TodoStorageResult<PersistedTodoList> {
	if (!isObject(value) || typeof value.description !== "string" || !Array.isArray(value.items)) {
		return err(new Error("todos.json 不是有效的 Todo List"));
	}

	const items: TodoItem[] = [];
	for (const [index, item] of value.items.entries()) {
		if (
			!isObject(item) ||
			item.orderNum !== index + 1 ||
			typeof item.content !== "string" ||
			!isItemStatus(item.status) ||
			!isPriority(item.priority)
		) {
			return err(new Error(`todos.json 中的 Item ${index + 1} 无效`));
		}

		items.push({
			orderNum: item.orderNum,
			content: item.content,
			status: item.status,
			...(item.priority === undefined ? {} : { priority: item.priority }),
		});
	}

	return ok({ description: value.description, items });
}

/** 判断未知值是否为非空对象。 */
function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** 判断未知值是否属于 Todo Item 状态。 */
function isItemStatus(value: unknown): value is TodoItemStatus {
	return value === "pending" ||
		value === "in_progress" ||
		value === "completed";
}

/** 判断未知值是否为空或有效 Todo priority。 */
function isPriority(value: unknown): value is TodoPriority | undefined {
	return value === undefined || value === "high" || value === "medium" || value === "low";
}

/** 为底层文件错误补充 Todo 操作上下文。 */
function storageError(message: string, error: unknown): Error {
	return new Error(`${message}: ${toError(error).message}`);
}

// #endregion
