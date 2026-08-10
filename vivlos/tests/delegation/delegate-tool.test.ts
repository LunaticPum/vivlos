/**
 * delegate tool 测试。
 *
 * 注入 fake runner，验证批次校验、并行执行、XML 返回、
 * onUpdate 快照流式与工具白名单过滤。
 */

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { Api, Model, Message } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";

import type {
	DelegationBatchState,
	SubagentRunResult,
} from "@vivlos/agent/delegation/types.ts";
import {
	createDelegateTool,
	type DelegateToolDeps,
} from "@vivlos/agent/tools/advanced/delegate/delegate.ts";
import {
	createEventBus,
	type DelegationTaskMessagesEvent,
} from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import { ToolError } from "@vivlos/shared";

function fakeTool(name: string): AgentTool<any, any> {
	return {
		name,
		label: name,
		description: name,
		parameters: Type.Object({}),
		async execute() {
			return { content: [{ type: "text", text: "ok" }], details: {} };
		},
	};
}

const POOL = [
	"read",
	"write",
	"bash",
	"ls",
	"grep",
	"find",
	"skill",
	"delegate",
	"memory",
].map(fakeTool);

function completed(text: string, turns = 3): SubagentRunResult {
	return { state: "completed", text, turns, durationMs: 100 };
}

function createDeps(
	options: {
		run?: DelegateToolDeps["run"];
		tools?: AgentTool<any, any>[];
		eventBus?: ReturnType<typeof createEventBus>;
	} = {},
): DelegateToolDeps {
	return {
		llm: {} as LLMClient,
		getModel: () => ({}) as Model<Api>,
		getAvailableTools: () => options.tools ?? POOL,
		eventBus: options.eventBus ?? createEventBus(),
		getSessionId: () => "test-session",
		...(options.run ? { run: options.run } : {}),
	};
}

async function execute(
	tool: ReturnType<typeof createDelegateTool>,
	params: unknown,
	onUpdate?: (update: AgentToolResult<DelegationBatchState>) => void,
) {
	return tool.execute("call-1", params as never, undefined, onUpdate);
}

function textOf(result: AgentToolResult<DelegationBatchState>): string {
	return (result.content[0] as { type: "text"; text: string }).text;
}

describe("delegate tool validation", () => {
	it("DEL-TOOL-001 空批次与超限批次被拒绝", async () => {
		const tool = createDelegateTool(createDeps({ run: vi.fn() as never }));

		await expect(execute(tool, { tasks: [] })).rejects.toThrow("至少需要 1 个子任务");
		await expect(
			execute(tool, {
				tasks: [
					{ kind: "exploring", title: "a", brief: "x" },
					{ kind: "exploring", title: "b", brief: "x" },
					{ kind: "exploring", title: "c", brief: "x" },
				],
			}),
		).rejects.toThrow("最多委派 2 个");
	});

	it("DEL-TOOL-002 两个 writing 被拒绝", async () => {
		const tool = createDelegateTool(createDeps({ run: vi.fn() as never }));

		await expect(
			execute(tool, {
				tasks: [
					{ kind: "writing", title: "a", brief: "x" },
					{ kind: "writing", title: "b", brief: "x" },
				],
			}),
		).rejects.toThrow("最多 1 个 writing");
	});

	it("DEL-TOOL-003 空标题或空描述被拒绝", async () => {
		const tool = createDelegateTool(createDeps({ run: vi.fn() as never }));

		await expect(
			execute(tool, { tasks: [{ kind: "exploring", title: "  ", brief: "x" }] }),
		).rejects.toThrow("title");
		await expect(
			execute(tool, { tasks: [{ kind: "exploring", title: "a", brief: "" }] }),
		).rejects.toThrow("brief");
	});

	it("DEL-TOOL-003b 校验失败抛出 ToolError", async () => {
		const tool = createDelegateTool(createDeps({ run: vi.fn() as never }));

		await expect(execute(tool, { tasks: [] })).rejects.toBeInstanceOf(ToolError);
	});
});

describe("delegate tool execution", () => {
	it("DEL-TOOL-004 批次成功返回 XML 摘要与终态 details", async () => {
		const run = vi.fn(async ({ spec }: { spec: { title: string } }) =>
			completed(`${spec.title} 的结果`),
		);
		const tool = createDelegateTool(createDeps({ run: run as never }));

		const result = await execute(tool, {
			tasks: [
				{ kind: "exploring", title: "查找", brief: "找代码" },
				{ kind: "writing", title: "实现", brief: "写代码" },
			],
		});

		expect(run).toHaveBeenCalledTimes(2);
		const xml = textOf(result);
		expect(xml).toContain('<delegation tasks="2" completed="2" failed="0">');
		expect(xml).toContain('kind="exploring"');
		expect(xml).toContain('kind="writing"');
		expect(xml).toContain("查找 的结果");
		expect(xml).toContain("实现 的结果");
		expect(result.details.phase).toBe("done");
		expect(result.details.tasks.map((task) => task.state)).toEqual([
			"completed",
			"completed",
		]);
	});

	it("DEL-TOOL-005 部分失败不算工具错误且 XML 标记失败数", async () => {
		const run = vi.fn(
			async ({ spec }: { spec: { kind: string } }): Promise<SubagentRunResult> =>
				spec.kind === "exploring"
					? completed("找到了")
					: {
							state: "error",
							text: "",
							turns: 1,
							durationMs: 50,
							error: "模型 Provider 返回错误",
						},
		);
		const tool = createDelegateTool(createDeps({ run: run as never }));

		const result = await execute(tool, {
			tasks: [
				{ kind: "exploring", title: "查", brief: "x" },
				{ kind: "writing", title: "写", brief: "x" },
			],
		});

		const xml = textOf(result);
		expect(xml).toContain('completed="1" failed="1"');
		expect(xml).toContain("模型 Provider 返回错误");
	});

	it("DEL-TOOL-006 全部失败仍以 XML 返回失败明细", async () => {
		const run = vi.fn(async (): Promise<SubagentRunResult> => ({
			state: "aborted",
			text: "",
			turns: 0,
			durationMs: 10,
			error: "已被父会话中止",
		}));
		const tool = createDelegateTool(createDeps({ run: run as never }));

		const result = await execute(tool, {
			tasks: [{ kind: "exploring", title: "查", brief: "x" }],
		});

		const xml = textOf(result);
		expect(xml).toContain('completed="0" failed="1"');
		expect(xml).toContain("已被父会话中止");
	});

	it("DEL-TOOL-007 按类别过滤子 agent 工具且透传中止信号", async () => {
		const seen: { tools: string[]; signal?: AbortSignal }[] = [];
		const run = vi.fn(async (params: { tools: AgentTool<any, any>[]; signal?: AbortSignal }) => {
			seen.push({
				tools: params.tools.map((tool) => tool.name),
				signal: params.signal,
			});
			return completed("ok");
		});
		const tool = createDelegateTool(createDeps({ run: run as never }));
		const controller = new AbortController();

		await tool.execute(
			"call-1",
			{
				tasks: [
					{ kind: "exploring", title: "查", brief: "x" },
					{ kind: "writing", title: "写", brief: "x" },
				],
			} as never,
			controller.signal,
		);

		expect(seen[0].tools).toEqual(["read", "ls", "grep", "find", "skill"]);
		expect(seen[1].tools).toEqual([
			"read",
			"write",
			"bash",
			"ls",
			"grep",
			"find",
			"skill",
		]);
		expect(seen[0].signal).toBe(controller.signal);
		expect(seen[1].signal).toBe(controller.signal);
	});

	it("DEL-TOOL-008 onUpdate 先推运行态、收尾推终态快照", async () => {
		const run = vi.fn(async () => completed("ok"));
		const tool = createDelegateTool(createDeps({ run: run as never }));
		const updates: DelegationBatchState[] = [];

		await execute(tool, { tasks: [{ kind: "exploring", title: "查", brief: "x" }] }, (update) => {
			updates.push(update.details);
		});

		expect(updates.length).toBeGreaterThanOrEqual(2);
		expect(updates[0].phase).toBe("running");
		expect(updates[0].tasks[0].state).toBe("running");
		const last = updates[updates.length - 1];
		expect(last.phase).toBe("done");
		expect(last.tasks[0].state).toBe("completed");
		expect(last.tasks[0].result).toBe("ok");
	});

	it("DEL-TOOL-009 快照不可变：后续变更不影响已推送的 details", async () => {
		let resolveRun: ((result: SubagentRunResult) => void) | undefined;
		const run = vi.fn(
			() =>
				new Promise<SubagentRunResult>((resolve) => {
					resolveRun = resolve;
				}),
		);
		const tool = createDelegateTool(createDeps({ run: run as never }));
		const updates: DelegationBatchState[] = [];

		const pending = execute(
			tool,
			{ tasks: [{ kind: "exploring", title: "查", brief: "x" }] },
			(update) => updates.push(update.details),
		);
		await vi.waitFor(() => expect(run).toHaveBeenCalled());
		resolveRun?.(completed("done"));
		await pending;

		expect(updates[0].tasks[0].state).toBe("running");
		expect(updates[0].tasks[0].result).toBeUndefined();
	});

	it("DEL-TOOL-010 子会话消息深拷贝：emit 的不是 pi 活引用", async () => {
		// pi agentLoop 的消息对象在运行中会被持续改写；若直接透传活引用，
		// 钻取视图渲染时会读到不一致状态。这里验证捕获时已深拷贝。
		const assistantMsg = {
			role: "assistant",
			content: [{ type: "text", text: "answer" }],
			timestamp: 1000,
			stopReason: "stop",
		} as unknown as Message;
		const toolResultMsg = {
			role: "toolResult",
			toolCallId: "tc-1",
			content: [{ type: "text", text: "tool output" }],
			timestamp: 1001,
		} as unknown as Message;

		const run = vi.fn(
			async ({ onEvent }: { onEvent?: (event: never) => void }) => {
				onEvent?.({ type: "message_end", message: assistantMsg } as never);
				onEvent?.({
					type: "turn_end",
					message: assistantMsg,
					toolResults: [toolResultMsg],
				} as never);
				return completed("answer");
			},
		);

		const eventBus = createEventBus();
		const captured: DelegationTaskMessagesEvent[] = [];
		eventBus.on("delegation:task_messages", (e) => {
			captured.push(e);
		});

		const tool = createDelegateTool(createDeps({ run: run as never, eventBus }));
		await execute(tool, {
			tasks: [{ kind: "exploring", title: "查", brief: "x" }],
		});

		const last = captured[captured.length - 1];
		expect(last).toBeDefined();
		// [brief, assistant, toolResult]
		expect(last.messages).toHaveLength(3);
		// 深拷贝：引用不同、内容相等、嵌套 content 也非同一引用
		expect(last.messages[1]).not.toBe(assistantMsg);
		expect(last.messages[1]).toEqual(assistantMsg);
		expect((last.messages[1] as { content: unknown }).content).not.toBe(
			(assistantMsg as { content: unknown }).content,
		);
		expect(last.messages[2]).not.toBe(toolResultMsg);
		expect(last.messages[2]).toEqual(toolResultMsg);
	});
});
