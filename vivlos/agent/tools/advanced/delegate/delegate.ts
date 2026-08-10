/**
 * delegate tool：把 1-2 个子任务委派给独立上下文的子代理。
 *
 * 单次调用 = 一个批次：子任务真并行（Promise.all），工具同步等待
 * 全部终态后返回结构化 XML 摘要。批次状态经 onUpdate 流式推送
 * （details 为批次快照），最终状态随 toolResult.details 供历史重建。
 */

import { Type } from "@earendil-works/pi-ai";
import type {
	AgentTool,
	AgentToolResult,
	StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, Message, Model, ThinkingLevel } from "@earendil-works/pi-ai";

import {
	filterToolsForKind,
	renderDelegationXml,
	runSubagent,
	type DelegationBatchState,
	type DelegationTaskSpec,
} from "@vivlos/agent/delegation/index.ts";
import { buildBriefUserMessage } from "@vivlos/agent/delegation/prompts.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import { ToolError } from "@vivlos/shared";

import { DELEGATE_DESCRIPTION } from "./description.ts";

// #region Schema

const TaskKindSchema = Type.Union(
	[Type.Literal("exploring"), Type.Literal("writing")],
	{ description: "任务类别：exploring=只读探索，writing=可写实现" },
);

const TaskSpecSchema = Type.Object(
	{
		kind: TaskKindSchema,
		title: Type.String({ description: "任务短标题（建议 15 字内）" }),
		brief: Type.String({
			description: "详细任务描述：目标、范围、期望返回",
		}),
		context: Type.Optional(
			Type.String({ description: "背景信息：主会话已确认的事实与约束" }),
		),
		references: Type.Optional(
			Type.Array(Type.String(), { description: "参考资料路径列表" }),
		),
	},
	{ additionalProperties: false },
);

export const DelegateParameters = Type.Object(
	{
		tasks: Type.Array(TaskSpecSchema, {
			minLength: 1,
			maxLength: 2,
			description: "子任务列表，1-2 个",
		}),
	},
	{ additionalProperties: false },
);

// #endregion

// #region Tool 契约

export interface DelegateToolDeps {
	readonly llm: LLMClient;
	readonly getModel: () => Model<Api>;
	readonly thinkingLevel?: ThinkingLevel;
	/** 全部可选工具（通常为 builtin tools），内部按类别过滤。 */
	readonly getAvailableTools: () => readonly AgentTool<any, any>[];
	/** 子会话消息快照推送通道（钻取视图）。 */
	readonly eventBus: EventBus;
	/** 当前主 session ID。 */
	readonly getSessionId: () => string;
	/** 测试注入点；缺省使用真实 runner。 */
	readonly run?: typeof runSubagent;
}

/** onUpdate 推送的最小间隔（毫秒）。 */
const PUSH_INTERVAL_MS = 200;

/** 创建 delegate tool。 */
export function createDelegateTool(
	deps: DelegateToolDeps,
): AgentTool<typeof DelegateParameters, DelegationBatchState> {
	const run = deps.run ?? runSubagent;
	const stream = bridgeStream(deps.llm);

	return {
		name: "delegate",
		label: "任务委派",
		description: DELEGATE_DESCRIPTION,
		parameters: DelegateParameters,
		executionMode: "sequential",
		async execute(toolCallId, params, signal, onUpdate) {
			const specs = params.tasks as DelegationTaskSpec[];
			const invalid = validateBatch(specs);
			if (invalid) throw new ToolError(invalid, "delegate");

			const batch = createBatch(specs);
			const push = createThrottledPush(PUSH_INTERVAL_MS, () => {
				onUpdate?.({ content: [], details: snapshotBatch(batch) });
			});
			push.now();

			// 子会话消息捕获（钻取视图数据源）：brief 首条消息 + 运行中增量
			const sessionMessages: Message[][] = specs.map((spec) => [
				buildBriefUserMessage(spec),
			]);
			const emitMessages = (index: number, running: boolean) => {
				const task = batch.tasks[index];
				deps.eventBus.emit({
					type: "delegation:task_messages",
					sessionId: deps.getSessionId(),
					taskId: `${toolCallId}:${task.id}`,
					kind: task.kind,
					title: task.title,
					messages: [...sessionMessages[index]!],
					running,
				});
			};
			specs.forEach((_, index) => emitMessages(index, true));

			await Promise.all(
				specs.map((spec, index) =>
					run({
						spec,
						tools: filterToolsForKind(spec.kind, deps.getAvailableTools()),
						model: deps.getModel(),
						stream,
						thinkingLevel: deps.thinkingLevel,
						signal,
						onEvent: (event) => {
							const task = batch.tasks[index];
							if (event.type === "tool_execution_start") {
								task.currentTool = event.toolName;
								push.later();
							} else if (event.type === "tool_execution_end") {
								task.currentTool = undefined;
								push.later();
						} else if (
							event.type === "message_end" &&
							event.message.role === "assistant"
						) {
							sessionMessages[index]!.push(cloneMessage(event.message as Message));
							emitMessages(index, true);
						} else if (event.type === "turn_end") {
							task.turns += 1;
							for (const toolResult of event.toolResults) {
								sessionMessages[index]!.push(cloneMessage(toolResult));
							}
							emitMessages(index, true);
							push.later();
						}
						},
					}).then((result) => {
						const task = batch.tasks[index];
						task.state = result.state;
						task.completedAt = Date.now();
						task.turns = result.turns;
						task.result = result.text;
						task.error = result.error;
						task.currentTool = undefined;
						emitMessages(index, false);
						push.later();
					}),
				),
			);

			batch.phase = "done";
			push.flush();

			const xml = renderDelegationXml(batch);
			return {
				content: [{ type: "text", text: xml }],
				details: snapshotBatch(batch),
			};
		},
	};
}

// #endregion

// #region 辅助

/**
 * 深拷贝子会话消息。
 *
 * event.message / event.toolResults 是 pi agentLoop 内部 context 正在使用的
 * 活对象，子任务运行中会被 pi 持续改写。钻取视图若直接读这些活引用，会在
 * 渲染时撞上不一致状态而崩溃。捕获时即深拷贝，TUI 拿到的是不可变快照。
 */
function cloneMessage(message: Message): Message {
	try {
		return structuredClone(message);
	} catch {
		// 极端情况下（非可克隆内容）退回原引用，宁可保留旧风险也不中断委派
		return message;
	}
}

function validateBatch(
	specs: readonly DelegationTaskSpec[],
): string | null {
	if (specs.length === 0) return "至少需要 1 个子任务";
	if (specs.length > 2) return "每批最多委派 2 个子任务";
	const writing = specs.filter((spec) => spec.kind === "writing").length;
	if (writing > 1) {
		return "每批最多 1 个 writing 任务（并发写同一代码库会互相覆盖），其余请使用 exploring";
	}
	for (const spec of specs) {
		if (!spec.title.trim()) return "子任务 title 不能为空";
		if (!spec.brief.trim()) return "子任务 brief 不能为空";
	}
	return null;
}

function createBatch(
	specs: readonly DelegationTaskSpec[],
): DelegationBatchState {
	const now = Date.now();
	return {
		phase: "running",
		tasks: specs.map((spec, index) => ({
			id: `t${index + 1}`,
			kind: spec.kind,
			title: spec.title,
			state: "running",
			startedAt: now,
			turns: 0,
		})),
	};
}

function snapshotBatch(batch: DelegationBatchState): DelegationBatchState {
	return {
		phase: batch.phase,
		tasks: batch.tasks.map((task) => ({ ...task })),
	};
}

function bridgeStream(llm: LLMClient): StreamFn {
	return (model, context, options) =>
		llm.stream(model, context, {
			signal: options?.signal,
			reasoning: options?.reasoning,
		});
}

interface ThrottledPush {
	/** 立即推送。 */
	now(): void;
	/** 节流推送：间隔内的多次调用合并为一次尾部推送。 */
	later(): void;
	/** 结束前强制推送，保证最终态送达。 */
	flush(): void;
}

function createThrottledPush(
	intervalMs: number,
	push: () => void,
): ThrottledPush {
	let lastAt = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const fire = () => {
		lastAt = Date.now();
		push();
	};
	return {
		now() {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
			fire();
		},
		later() {
			const elapsed = Date.now() - lastAt;
			if (elapsed >= intervalMs) {
				fire();
				return;
			}
			if (!timer) {
				timer = setTimeout(() => {
					timer = undefined;
					fire();
				}, intervalMs - elapsed);
				timer.unref?.();
			}
		},
		flush() {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
			fire();
		},
	};
}

// #endregion
