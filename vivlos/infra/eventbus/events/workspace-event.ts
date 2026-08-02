/** Workspace 中 Todo、Task 与交互选择的事件。 */

// #region Todo

/** Todo Item 的辅助优先级；实际执行顺序始终由 orderNum 决定。 */
export type TodoPriority = "high" | "medium" | "low";

/** Todo Item 的单向执行状态。 */
export type TodoItemStatus =
	| "pending"
	| "in_progress"
	| "completed";

/** Todo List 根据 Item 状态派生的整体状态。 */
export type TodoListStatus = "active" | "completed";

/** 按执行位置编号的 Todo Item。 */
export interface TodoItem {
	readonly orderNum: number;
	readonly content: string;
	readonly status: TodoItemStatus;
	readonly priority?: TodoPriority;
}

/** 当前 Session 中完整且已派生执行索引的 Todo List。 */
export interface TodoList {
	readonly description: string;
	readonly status: TodoListStatus;
	readonly pendingList?: readonly {
		readonly orderNum: number;
		readonly priority?: TodoPriority;
	}[];
	readonly inProgressOrderNum?: number;
	readonly items: readonly TodoItem[];
}

// #endregion

// #region Task 与 Offer Choice

export interface TaskItem {
	readonly id: string;
	readonly title: string;
	readonly description?: string;
	readonly status: "pending" | "in_progress" | "completed";
	readonly createdAt: number;
	readonly completedAt?: number;
}

// #endregion

export type WorkspaceEvent =
	| {
			readonly type: "todo:updated";
			readonly sessionId: string;
			readonly todoList: TodoList | null;
	  }
	| {
			readonly type: "task:created";
			readonly listName: string;
			readonly task: TaskItem;
	  }
	| {
			readonly type: "task:updated";
			readonly listName: string;
			readonly task: TaskItem;
	  }
	| {
			readonly type: "task:completed";
			readonly listName: string;
			readonly taskId: string;
	  }
	| {
			readonly type: "offer_choice:pending";
			readonly resolveId: string;
			readonly prompt: string;
			readonly choices: readonly string[];
			readonly multiple: boolean;
	  }
	| {
			readonly type: "offer_choice:resolved";
			readonly resolveId: string;
			readonly selection: string | readonly string[];
	  };
