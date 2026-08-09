/**
 * Subagent 委派领域类型。
 *
 * 批次状态由 delegate tool 的执行闭包持有，
 * 经 onUpdate 流式推送给 TUI，不做全局持久化。
 */

/** 委派任务类别：exploring 只读探索，writing 可写实现。 */
export type TaskKind = "exploring" | "writing";

/** 单个委派任务的规格（delegate tool 入参）。 */
export interface DelegationTaskSpec {
	readonly kind: TaskKind;
	/** 短标题，用于 UI 展示与结果标识。 */
	readonly title: string;
	/** 详细任务描述：目标、范围、期望返回。 */
	readonly brief: string;
	/** 背景信息：主会话已确认的事实与约束。 */
	readonly context?: string;
	/** 参考资料路径列表（传路径而非内容）。 */
	readonly references?: readonly string[];
}

/** 子 agent 运行的终态。 */
export type SubagentState =
	| "completed"
	| "turn_limited"
	| "timeout"
	| "aborted"
	| "error";

/** 子 agent 运行结果。 */
export interface SubagentRunResult {
	readonly state: SubagentState;
	/** 最后一条 assistant 文本（非 completed 时可能为空或不完整）。 */
	readonly text: string;
	readonly turns: number;
	readonly durationMs: number;
	/** 失败或受限原因（state 非 completed 时存在）。 */
	readonly error?: string;
}

/** 批次内单个任务的运行时状态（闭包持有的可变对象）。 */
export interface DelegationTaskState {
	readonly id: string;
	readonly kind: TaskKind;
	readonly title: string;
	/** running，或完成后的终态。 */
	state: "running" | SubagentState;
	readonly startedAt: number;
	completedAt?: number;
	turns: number;
	/** 正在执行的工具名（进度展示用）。 */
	currentTool?: string;
	/** 子 agent 的最终文本。 */
	result?: string;
	/** 失败/受限原因。 */
	error?: string;
}

/** 批次整体状态（onUpdate 流式与 TUI 渲染数据）。 */
export interface DelegationBatchState {
	phase: "running" | "done";
	tasks: DelegationTaskState[];
}
