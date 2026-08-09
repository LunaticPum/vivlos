/**
 * Subagent Runner 离线测试。
 *
 * 使用 pi-ai 官方 faux provider 驱动真实 agentLoop；子 agent 工具是内存 fake，
 * 不读取 .env、不访问网络或真实 Provider。
 */

import type {
	Api,
	Context,
	Model,
	SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxToolCall,
	type FauxResponseStep,
} from "@earendil-works/pi-ai/providers/faux";
import { Type } from "@earendil-works/pi-ai";
import type {
	AgentEvent,
	AgentTool,
	StreamFn,
} from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import {
	runSubagent,
	type SubagentBudget,
} from "@vivlos/agent/delegation/runner.ts";
import type { DelegationTaskSpec } from "@vivlos/agent/delegation/types.ts";

const SPEC: DelegationTaskSpec = {
	kind: "exploring",
	title: "查找实现",
	brief: "定位目标代码并返回 file:line。",
	context: "项目使用 Bun + TypeScript",
	references: ["vivlos/agent/delegation/runner.ts"],
};

const DEFAULT_BUDGET: SubagentBudget = { maxTurns: 6, timeoutMs: 10_000 };

function fakeTool(name: string): AgentTool<any, any> {
	return {
		name,
		label: name,
		description: name,
		parameters: Type.Object({}),
		async execute() {
			return { content: [{ type: "text", text: `${name} ok` }], details: {} };
		},
	};
}

function readCall(id = "read-1") {
	return fauxToolCall("read", {}, { id });
}

interface RunExtras {
	readonly budget?: SubagentBudget;
	readonly signal?: AbortSignal;
	readonly onEvent?: (event: AgentEvent) => void;
	readonly spec?: DelegationTaskSpec;
}

function createHarness(
	options: {
		responses?: FauxResponseStep[];
		tools?: AgentTool<any, any>[];
	} = {},
) {
	const faux = createFauxCore({
		api: "faux-delegation",
		provider: "faux-delegation",
		models: [{ id: "runner-model", input: ["text"] }],
	});
	faux.setResponses(
		options.responses ?? [fauxAssistantMessage("结论：目标在 runner.ts:42")],
	);
	const contexts: Context[] = [];
	const stream: StreamFn = async (requestModel, context, streamOptions) => {
		contexts.push({
			systemPrompt: context.systemPrompt,
			messages: structuredClone(context.messages),
			tools: context.tools?.map((tool) => ({
				name: tool.name,
				description: tool.description,
				parameters: structuredClone(tool.parameters),
			})),
		});
		return faux.streamSimple(
			requestModel as Model<string>,
			context,
			streamOptions as SimpleStreamOptions,
		);
	};
	const tools = options.tools ?? [fakeTool("read"), fakeTool("grep")];
	const model = faux.getModel() as Model<Api>;

	return {
		model,
		contexts,
		run(extras: RunExtras = {}) {
			return runSubagent({
				spec: extras.spec ?? SPEC,
				tools,
				model,
				stream,
				budget: extras.budget ?? DEFAULT_BUDGET,
				signal: extras.signal,
				onEvent: extras.onEvent,
			});
		},
	};
}

describe("Subagent runner", () => {
	it("DEL-RUN-001 自然完成返回最后文本与统计", async () => {
		const harness = createHarness();

		const result = await harness.run();

		expect(result.state).toBe("completed");
		expect(result.text).toBe("结论：目标在 runner.ts:42");
		expect(result.turns).toBe(1);
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
		expect(result.error).toBeUndefined();
	});

	it("DEL-RUN-002 SP 与 task_brief 构成独立上下文", async () => {
		const harness = createHarness();

		await harness.run();

		expect(harness.contexts).toHaveLength(1);
		const context = harness.contexts[0];
		expect(context.systemPrompt).toContain("只读探索子代理");
		expect(context.systemPrompt).toContain("<environment>");
		const first = context.messages[0];
		expect(first.role).toBe("user");
		const text = (first.content[0] as { type: string; text: string }).text;
		expect(text).toContain("<task_brief>");
		expect(text).toContain("<goal>查找实现</goal>");
		expect(text).toContain("<context>项目使用 Bun + TypeScript</context>");
		expect(text).toContain("<ref>vivlos/agent/delegation/runner.ts</ref>");
		expect(context.tools?.map((tool) => tool.name)).toEqual(["read", "grep"]);
	});

	it("DEL-RUN-003 工具循环事件经 onEvent 转发", async () => {
		const harness = createHarness({
			responses: [
				fauxAssistantMessage([readCall()], { stopReason: "toolUse" }),
				fauxAssistantMessage("最终结论"),
			],
		});
		const events: AgentEvent[] = [];

		const result = await harness.run({ onEvent: (event) => events.push(event) });

		expect(result.state).toBe("completed");
		expect(result.text).toBe("最终结论");
		expect(result.turns).toBe(2);
		const toolStarts = events.filter((e) => e.type === "tool_execution_start");
		const toolEnds = events.filter((e) => e.type === "tool_execution_end");
		const turnEnds = events.filter((e) => e.type === "turn_end");
		expect(toolStarts).toHaveLength(1);
		expect(toolEnds).toHaveLength(1);
		expect(turnEnds).toHaveLength(2);
	});

	it("DEL-RUN-004 达到轮次上限返回 turn_limited 并保留部分结果", async () => {
		const harness = createHarness();

		const result = await harness.run({ budget: { maxTurns: 1, timeoutMs: 10_000 } });

		expect(result.state).toBe("turn_limited");
		expect(result.text).toBe("结论：目标在 runner.ts:42");
		expect(result.error).toContain("轮次上限");
	});

	it("DEL-RUN-005 Provider 错误返回 error", async () => {
		const harness = createHarness({
			responses: [
				fauxAssistantMessage("", {
					stopReason: "error",
					errorMessage: "provider unavailable",
				}),
			],
		});

		const result = await harness.run();

		expect(result.state).toBe("error");
		expect(result.error).toContain("Provider");
	});

	it("DEL-RUN-006 timeout 与外部 abort 正确归类", async () => {
		const timeout = createHarness({
			responses: [
				async () => {
					await new Promise((resolve) => setTimeout(resolve, 20));
					return fauxAssistantMessage("too late");
				},
			],
		});
		const aborted = createHarness();
		const controller = new AbortController();
		controller.abort();

		const timeoutResult = await timeout.run({
			budget: { maxTurns: 6, timeoutMs: 2 },
		});
		const abortResult = await aborted.run({ signal: controller.signal });

		expect(timeoutResult.state).toBe("timeout");
		expect(timeoutResult.error).toContain("超时");
		expect(abortResult.state).toBe("aborted");
		expect(abortResult.error).toContain("中止");
	});

	it("DEL-RUN-007 预算参数非法时直接拒绝", async () => {
		const harness = createHarness();

		await expect(
			harness.run({ budget: { maxTurns: 0, timeoutMs: 1000 } }),
		).rejects.toThrow("maxTurns");
	});
});
