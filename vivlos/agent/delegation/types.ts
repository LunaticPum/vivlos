/**
 * Subagent 委派领域类型。
 *
 * 批次状态由 delegate tool 的执行闭包持有，
 * 经 onUpdate 流式推送给 TUI，不做全局持久化。
 */

/**
 * 委派任务类别。
 *
 * 决定子 agent 的系统提示词模板与可用工具白名单：
 * - `exploring` — 只读探索，仅允许 read / ls / grep / find / skill
 * - `writing` — 可写实现，额外允许 write / bash
 *
 * 每批最多 1 个 writing 任务，其余须为 exploring，
 * 防止并发写同一代码库导致互相覆盖。
 *
 * @see {@link file://./tool-policy.ts} — 各类别的工具白名单
 * @see {@link file://./prompts.ts} — 各类别的系统提示词模板
 */
export type TaskKind = "exploring" | "writing";

/**
 * 单个委派任务的规格（delegate tool 入参）。
 *
 * 由主 agent 在调用 delegate tool 时构造，经 XML 序列化为子 agent
 * 的首条 user 消息（task_brief），是主会话→子 agent 的唯一信息通道。
 *
 * @example
 * ```ts
 * const spec: DelegationTaskSpec = {
 *   kind: "exploring",
 *   title: "查找所有未处理的 TODO 注释",
 *   brief: "扫描 src/ 下所有 .ts 文件，列出包含 TODO 的位置及内容",
 *   context: "项目使用 TypeScript 5.x，源码在 src/ 目录",
 *   references: ["src/index.ts", "src/utils.ts"],
 * };
 * ```
 */
export interface DelegationTaskSpec {
	/**
	 * 任务类别，决定子 agent 的提示词模板与工具权限。
	 * @see {@link TaskKind}
	 */
	readonly kind: TaskKind;
	/** 短标题，用于 UI 展示与结果标识（建议 15 字内）。 */
	readonly title: string;
	/** 详细任务描述：目标、范围、期望返回。 */
	readonly brief: string;
	/** 背景信息：主会话已确认的事实与约束，帮助子 agent 避免重复探索。 */
	readonly context?: string;
	/** 参考资料路径列表（传路径而非内容），子 agent 可自行读取。 */
	readonly references?: readonly string[];
}

/**
 * 子 agent 运行的终态。
 *
 * 覆盖所有可能的结束原因：
 * - `completed` — 正常完成，模型自行决定停止
 * - `turn_limited` — 达到轮次上限（exploring 20 / writing 40），结果可能不完整
 * - `timeout` — 超过时间预算（exploring 5min / writing 15min）
 * - `aborted` — 被父会话中止（signal 级联）
 * - `error` — 模型 Provider 返回错误或运行异常
 *
 * @see {@link SubagentRunResult.state}
 */
export type SubagentState =
	| "completed"
	| "turn_limited"
	| "timeout"
	| "aborted"
	| "error";

/**
 * 子 agent 运行结果（runner 返回值）。
 *
 * 由 {@link file://./runner.ts | runSubagent} 产出，delegate tool 据此
 * 更新批次状态并渲染 XML 摘要。
 */
export interface SubagentRunResult {
	/** 运行终态，决定后续处理路径。 */
	readonly state: SubagentState;
	/** 最后一条 assistant 文本（非 completed 时可能为空或不完整）。 */
	readonly text: string;
	/** 实际消耗的 assistant 轮次数。 */
	readonly turns: number;
	/** 从启动到终态的挂钟耗时（毫秒）。 */
	readonly durationMs: number;
	/** 失败或受限原因（state 非 completed 时存在），用于 XML 渲染与 UI 展示。 */
	readonly error?: string;
}

/**
 * 批次内单个任务的运行时状态（闭包持有的可变对象）。
 *
 * 在 delegate tool 执行期间由闭包维护，经节流推送供 TUI 实时渲染；
 * 终态后序列化为 XML 进入 toolResult，随 history.jsonl 持久化。
 *
 * @see {@link DelegationBatchState.tasks}
 */
export interface DelegationTaskState {
	/** 任务 ID，格式为 `t{index+1}`（如 `t1`、`t2`），批次内唯一。 */
	readonly id: string;
	/** 任务类别（继承自 spec，运行时不可变）。 */
	readonly kind: TaskKind;
	/** 任务短标题（继承自 spec，运行时不可变）。 */
	readonly title: string;
	/** 当前运行状态：`running` 表示进行中，否则为终态。 */
	state: "running" | SubagentState;
	/** 任务启动时间戳（`Date.now()` 毫秒值）。 */
	readonly startedAt: number;
	/** 任务结束时间戳；未完成时为 `undefined`。 */
	completedAt?: number;
	/** 已完成的 assistant 轮次数，运行中实时更新。 */
	turns: number;
	/** 正在执行的工具名（进度展示用），空闲时为 `undefined`。 */
	currentTool?: string;
	/** 子 agent 的最终文本（对应 SubagentRunResult.text）。 */
	result?: string;
	/** 失败/受限原因（对应 SubagentRunResult.error）。 */
	error?: string;
}

/**
 * 批次整体状态（onUpdate 流式推送与 TUI 渲染的数据源）。
 *
 * delegate tool 每次 onUpdate 推送的是该对象的深拷贝快照；
 * 最终状态随 toolResult.details 返回，同时 XML 文本进入主会话上下文。
 *
 * @see {@link file://../tools/advanced/delegate/delegate.ts | delegate.ts} — 批次创建与推送逻辑
 * @see {@link file://./xml.ts | xml.ts} — XML 渲染与解析
 */
export interface DelegationBatchState {
	/** 批次阶段：`running` 表示子任务仍在执行，`done` 表示全部终态。 */
	phase: "running" | "done";
	/** 批次内所有任务的运行时状态列表，顺序与入参 specs 一致。 */
	tasks: DelegationTaskState[];
}
