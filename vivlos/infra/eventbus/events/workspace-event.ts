/** Workspace 中 Todo、Task 与交互选择的事件。 */

export interface TodoItem {
	readonly content: string;
	readonly status: "pending" | "in_progress" | "completed" | "cancelled";
	readonly priority?: "high" | "medium" | "low";
}

export interface TaskItem {
	readonly id: string;
	readonly title: string;
	readonly description?: string;
	readonly status: "pending" | "in_progress" | "completed";
	readonly createdAt: number;
	readonly completedAt?: number;
}

export type WorkspaceEvent =
	| {
			readonly type: "todo:updated";
			readonly sessionId: string;
			readonly todos: TodoItem[];
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
