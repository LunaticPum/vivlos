/**
 * Consolidator Runner 离线测试。
 *
 * 使用 pi-ai 官方 faux provider 驱动真实 agentLoop；Repository、History 与
 * MemoryService 都是内存 fake，不读取 .env、不访问网络或真实 Provider。
 */

import type { Api, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxToolCall,
	type FauxResponseStep,
} from "@earendil-works/pi-ai/providers/faux";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createRunner,
	type RunInput,
	type RunnerConfig,
} from "@vivlos/agent/memory-refactor/consolidator/runner.ts";
import type { TriggerDecision } from "@vivlos/agent/memory-refactor/consolidator/trigger.ts";
import type {
	MemoryOperationContext,
	MemoryService,
	MemoryServiceResult,
	MemoryServiceValue,
} from "@vivlos/agent/memory-refactor/service.ts";
import { createEventBus, type VivlosEvent } from "@vivlos/infra/eventbus/index.ts";
import { initLogger } from "@vivlos/infra/logger/index.ts";
import type {
	History,
	MemoryRepository,
	MemoryStorageSnapshot,
} from "@vivlos/infra/storage/memory/index.ts";
import { err, ok } from "@vivlos/shared";

const SESSION_ID = "runner-session";
const DEFAULT_CONFIG: RunnerConfig = {
	maxTurns: 6,
	maxTools: 8,
	timeoutMs: 1_000,
};

interface ServiceCall {
	readonly action: "refine" | "merge";
	readonly context: MemoryOperationContext;
}

interface Harness {
	readonly runner: ReturnType<typeof createRunner>;
	readonly model: Model<Api>;
	readonly input: RunInput;
	readonly contexts: Context[];
	readonly streamModels: Model<Api>[];
	readonly serviceCalls: ServiceCall[];
	readonly logs: Extract<VivlosEvent, { type: "log" }>[];
	readonly counts: {
		repositoryReads: number;
		cursorReads: number;
		cursorSaves: number;
		streamCalls: number;
	};
	getCursor(): number;
	setCursor(line: number): void;
	appendResponses(responses: FauxResponseStep[]): void;
}

function snapshot(
	overrides: Partial<MemoryStorageSnapshot> = {},
): MemoryStorageSnapshot {
	return {
		entries: {
			memory: ["A complete verbose project fact."],
			user: ["User prefers concise answers."],
		},
		usage: {
			memory: { used: 33, cap: 100 },
			user: { used: 30, cap: 100 },
		},
		revision: "sha256:latest",
		...overrides,
	};
}

function decision(overrides: Partial<TriggerDecision> = {}): TriggerDecision {
	return {
		reason: "operation_threshold",
		cursor: 0,
		tail: 5,
		records: [],
		usage: snapshot().usage,
		files: [],
		...overrides,
	};
}

function committed(
	overrides: Partial<MemoryServiceValue> = {},
): MemoryServiceResult {
	return ok({
		status: "committed",
		changed: true,
		actor: "consolidator",
		action: "refine",
		file: "memory",
		before: "A complete verbose project fact.",
		after: "A complete project fact.",
		usage: { used: 25, cap: 100 },
		revisionBefore: "sha256:before",
		revisionAfter: "sha256:after",
		...overrides,
	} as MemoryServiceValue);
}

function noop(): MemoryServiceResult {
	return ok({
		status: "noop",
		changed: false,
		actor: "consolidator",
		action: "refine",
		file: "memory",
		before: "Keep exact entry.",
		after: "Keep exact entry.",
		usage: { used: 18, cap: 100 },
		revisionBefore: "sha256:same",
		revisionAfter: "sha256:same",
	});
}

function rejected(): MemoryServiceResult {
	return err({
		code: "not_found",
		message: "未找到 source entry",
		actor: "consolidator",
		action: "refine",
		file: "memory",
		usage: { used: 33, cap: 100 },
		revisionBefore: "sha256:same",
		revisionAfter: "sha256:same",
	});
}

function refineCall(id = "refine-1") {
	return fauxToolCall(
		"consolidate",
		{
			action: "refine",
			file: "memory",
			old_entry: "A complete verbose project fact.",
			new_entry: "A complete project fact.",
		},
		{ id },
	);
}

function mergeCall(id = "merge-1") {
	return fauxToolCall(
		"consolidate",
		{
			action: "merge",
			file: "user",
			old_entries: ["User prefers concise answers.", "User prefers direct answers."],
			new_entry: "User prefers concise, direct answers.",
		},
		{ id },
	);
}

function createHarness(options: {
	responses?: FauxResponseStep[];
	config?: Partial<RunnerConfig>;
	decision?: TriggerDecision;
	snapshot?: MemoryStorageSnapshot;
	serviceResults?: MemoryServiceResult[];
	serviceError?: Error;
	cursor?: number;
	saveError?: Error;
} = {}): Harness {
	const faux = createFauxCore({
		api: "faux-runner",
		provider: "faux-runner",
		models: [{ id: "runner-model", input: ["text"] }],
	});
	faux.setResponses(options.responses ?? [fauxAssistantMessage("无需整理")]);
	const contexts: Context[] = [];
	const streamModels: Model<Api>[] = [];
	const serviceCalls: ServiceCall[] = [];
	const counts = {
		repositoryReads: 0,
		cursorReads: 0,
		cursorSaves: 0,
		streamCalls: 0,
	};
	let cursor = options.cursor ?? 0;
	const currentSnapshot = options.snapshot ?? snapshot();
	const results = [...(options.serviceResults ?? [committed()])];

	const repository: MemoryRepository = {
		readSnapshot() {
			counts.repositoryReads++;
			return currentSnapshot;
		},
		write() {
			throw new Error("Runner 不应直接写 Repository");
		},
	};
	const history: History = {
		read() {
			throw new Error("Runner 不应重新读取 History records");
		},
		readCursor() {
			counts.cursorReads++;
			return cursor;
		},
		saveCursor(line) {
			counts.cursorSaves++;
			if (options.saveError) throw options.saveError;
			cursor = line;
			return cursor;
		},
	};
	const memoryService: MemoryService = {
		executeMain() {
			throw new Error("Consolidator 不应调用 executeMain");
		},
		executeConsolidation(command, context) {
			serviceCalls.push({ action: command.action, context });
			if (options.serviceError) throw options.serviceError;
			const result = results.shift();
			if (!result) throw new Error("fake Service 缺少预设结果");
			return result;
		},
	};
	const stream: StreamFn = async (requestModel, context, streamOptions) => {
		counts.streamCalls++;
		streamModels.push(requestModel);
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
	const eventBus = createEventBus();
	initLogger(eventBus);
	const logs: Extract<VivlosEvent, { type: "log" }>[] = [];
	eventBus.on("log", (event) => {
		logs.push(event);
	});
	const runtime = createRunner({
		stream,
		repository,
		history,
		memoryService,
		config: { ...DEFAULT_CONFIG, ...options.config },
	});
	const model = faux.getModel() as Model<Api>;
	const currentDecision = options.decision ?? decision();

	return {
		runner: {
			run(input) {
				initLogger(eventBus);
				return runtime.run(input);
			},
		},
		model,
		input: { decision: currentDecision, model, sessionId: SESSION_ID },
		contexts,
		streamModels,
		serviceCalls,
		logs,
		counts,
		getCursor: () => cursor,
		setCursor: (line) => {
			cursor = line;
		},
		appendResponses: faux.appendResponses,
	};
}

function expectTuiLog(harness: Harness, level: "warn" | "error"): void {
	expect(harness.logs).toContainEqual(
		expect.objectContaining({ level, onTui: true }),
	);
}

beforeEach(() => {
	vi.restoreAllMocks();
});

// #region Context 与正常完成

describe("Consolidator Runner context and completion", () => {
	it("MEM-RUN-001 使用当次 Model、最新 snapshot、单条 Prompt 和唯一 Tool", async () => {
		const latest = snapshot({
			entries: { memory: ["LATEST_MEMORY_ENTRY"], user: [] },
			usage: {
				memory: { used: 20, cap: 100 },
				user: { used: 0, cap: 100 },
			},
		});
		const harness = createHarness({ snapshot: latest });

		await harness.runner.run(harness.input);

		expect(harness.streamModels).toEqual([harness.model]);
		expect(harness.contexts).toHaveLength(1);
		const context = harness.contexts[0]!;
		expect(context.systemPrompt).toContain("L1 Memory Consolidator");
		expect(context.messages).toHaveLength(1);
		expect(context.messages[0]?.role).toBe("user");
		expect(JSON.stringify(context.messages)).toContain("LATEST_MEMORY_ENTRY");
		expect(context.tools?.map((tool) => tool.name)).toEqual(["consolidate"]);
		expect(JSON.stringify(context)).not.toContain("main Agent");
		expect(harness.counts.repositoryReads).toBe(1);
	});

	it("MEM-RUN-002 零 Tool 自然完成并推进 cursor", async () => {
		const harness = createHarness();

		const result = await harness.runner.run(harness.input);

		expect(result).toEqual({
			status: "completed",
			reason: "operation_threshold",
			toolCalls: 0,
			cursorBefore: 0,
			cursorAfter: 5,
		});
		expect(harness.getCursor()).toBe(5);
		expect(harness.counts.cursorSaves).toBe(1);
	});

	it("MEM-RUN-003 串行执行多个独立 Tool 并使用固定运行上下文", async () => {
		const harness = createHarness({
			responses: [
				fauxAssistantMessage([refineCall(), mergeCall()], { stopReason: "toolUse" }),
				fauxAssistantMessage("整理完成"),
			],
			serviceResults: [
				committed(),
				committed({
					action: "merge",
					file: "user",
					before: undefined,
					beforeEntries: [
						"User prefers concise answers.",
						"User prefers direct answers.",
					],
					after: "User prefers concise, direct answers.",
				}),
			],
		});

		const result = await harness.runner.run(harness.input);

		expect(result).toMatchObject({ status: "completed", toolCalls: 2, cursorAfter: 5 });
		expect(harness.serviceCalls.map((call) => call.action)).toEqual(["refine", "merge"]);
		expect(harness.serviceCalls.map((call) => call.context)).toEqual([
			{
				sessionId: SESSION_ID,
				reasonCode: "memory_consolidation",
				reason: "trigger:operation_threshold",
			},
			{
				sessionId: SESSION_ID,
				reasonCode: "memory_consolidation",
				reason: "trigger:operation_threshold",
			},
		]);
		expect(harness.counts.streamCalls).toBe(2);
	});

	it("MEM-RUN-004 业务 rejected/noop 可返回模型并自然完成", async () => {
		const harness = createHarness({
			responses: [
				fauxAssistantMessage([refineCall("rejected"), refineCall("noop")], {
					stopReason: "toolUse",
				}),
				(context) => {
					const results = context.messages.filter((message) => message.role === "toolResult");
					expect(results).toHaveLength(2);
					expect(results.every((message) => message.isError === false)).toBe(true);
					return fauxAssistantMessage("无需继续");
				},
			],
			serviceResults: [rejected(), noop()],
		});

		const result = await harness.runner.run(harness.input);

		expect(result).toMatchObject({ status: "completed", toolCalls: 2, cursorAfter: 5 });
		expect(harness.getCursor()).toBe(5);
	});
});

// #endregion

// #region 错误、中断与限制

describe("Consolidator Runner bounded failures", () => {
	it("MEM-RUN-005 区分 Provider、Tool 与输出错误且不推进 cursor", async () => {
		const provider = createHarness({
			responses: [
				fauxAssistantMessage("", {
					stopReason: "error",
					errorMessage: "provider unavailable",
				}),
			],
		});
		const output = createHarness({
			responses: [fauxAssistantMessage("truncated", { stopReason: "length" })],
		});
		const tool = createHarness({
			responses: [
				fauxAssistantMessage(refineCall(), { stopReason: "toolUse" }),
				fauxAssistantMessage("stop after tool error"),
			],
			serviceError: new Error("tool storage failed"),
		});

		const providerResult = await provider.runner.run(provider.input);
		const outputResult = await output.runner.run(output.input);
		const toolResult = await tool.runner.run(tool.input);

		expect(providerResult).toMatchObject({ status: "failed", error: { code: "provider_error" } });
		expect(outputResult).toMatchObject({ status: "failed", error: { code: "output_limit" } });
		expect(toolResult).toMatchObject({ status: "failed", error: { code: "tool_error" } });
		for (const current of [provider, output, tool]) {
			expect(current.getCursor()).toBe(0);
			expect(current.counts.cursorSaves).toBe(0);
			expectTuiLog(current, "error");
		}
	});

	it("MEM-RUN-006 timeout 与外部 abort 返回 aborted 并通知 TUI", async () => {
		const timeout = createHarness({
			responses: [
				async () => {
					await new Promise((resolve) => setTimeout(resolve, 20));
					return fauxAssistantMessage("too late");
				},
			],
			config: { timeoutMs: 2 },
		});
		const aborted = createHarness();
		const controller = new AbortController();
		controller.abort();

		const timeoutResult = await timeout.runner.run(timeout.input);
		const abortResult = await aborted.runner.run({
			...aborted.input,
			signal: controller.signal,
		});

		expect(timeoutResult).toMatchObject({ status: "aborted", error: { code: "timeout" } });
		expect(abortResult).toMatchObject({ status: "aborted", error: { code: "aborted" } });
		expect(timeout.getCursor()).toBe(0);
		expect(aborted.getCursor()).toBe(0);
		expectTuiLog(timeout, "error");
		expectTuiLog(aborted, "warn");
	});

	it("MEM-RUN-007 turn/tool 限制最终返回 run_limit", async () => {
		const tools = createHarness({
			responses: [
				fauxAssistantMessage([refineCall("allowed"), mergeCall("blocked")], {
					stopReason: "toolUse",
				}),
			],
			serviceResults: [committed()],
			config: { maxTools: 1 },
		});
		const turns = createHarness({
			responses: [fauxAssistantMessage(refineCall(), { stopReason: "toolUse" })],
			serviceResults: [committed()],
			config: { maxTurns: 1 },
		});

		const toolResult = await tools.runner.run(tools.input);
		const turnResult = await turns.runner.run(turns.input);

		expect(toolResult).toMatchObject({
			status: "failed",
			toolCalls: 1,
			error: { code: "run_limit" },
		});
		expect(turnResult).toMatchObject({ status: "failed", error: { code: "run_limit" } });
		expect(tools.getCursor()).toBe(0);
		expect(turns.getCursor()).toBe(0);
		expect(tools.counts.streamCalls).toBe(1);
		expect(turns.counts.streamCalls).toBe(1);
	});
});

// #endregion

// #region 并发、cursor 与复用

describe("Consolidator Runner lifecycle", () => {
	it("MEM-RUN-008 并发第二次调用立即 busy 且不重复读取或启动 Stream", async () => {
		let release!: () => void;
		let started!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const running = new Promise<void>((resolve) => {
			started = resolve;
		});
		const harness = createHarness({
			responses: [
				async () => {
					started();
					await gate;
					return fauxAssistantMessage("done");
				},
			],
		});
		const first = harness.runner.run(harness.input);
		await running;
		const before = { ...harness.counts };

		const second = await harness.runner.run(harness.input);

		expect(second).toMatchObject({ status: "busy", error: { code: "busy" } });
		expect(harness.counts).toEqual(before);
		release();
		expect(await first).toMatchObject({ status: "completed" });
	});

	it("MEM-RUN-009 cursor 变化时拒绝过期 decision 且不读取 snapshot/模型", async () => {
		const harness = createHarness({ cursor: 2 });

		const result = await harness.runner.run(harness.input);

		expect(result).toMatchObject({
			status: "failed",
			cursorBefore: 2,
			cursorAfter: 2,
			error: { code: "cursor_changed" },
		});
		expect(harness.counts.repositoryReads).toBe(0);
		expect(harness.counts.streamCalls).toBe(0);
		expectTuiLog(harness, "warn");
	});

	it("MEM-RUN-010 cursor 保存失败返回稳定错误且保留旧 cursor", async () => {
		const harness = createHarness({ saveError: new Error("disk readonly") });

		const result = await harness.runner.run(harness.input);

		expect(result).toMatchObject({
			status: "failed",
			cursorBefore: 0,
			cursorAfter: 0,
			error: { code: "cursor_save_failed" },
		});
		expect(harness.getCursor()).toBe(0);
		expect(harness.counts.cursorSaves).toBe(1);
		expectTuiLog(harness, "error");
	});

	it("MEM-RUN-011 所有终态结果只暴露稳定摘要字段", async () => {
		const secret = "PROMPT_OR_PROVIDER_SECRET";
		const completed = createHarness();
		const failed = createHarness({
			responses: [fauxAssistantMessage(secret, { stopReason: "length" })],
		});
		const aborted = createHarness();
		const controller = new AbortController();
		controller.abort(secret);

		const results = [
			await completed.runner.run(completed.input),
			await failed.runner.run(failed.input),
			await aborted.runner.run({ ...aborted.input, signal: controller.signal }),
		];

		for (const result of results) {
			expect(Object.keys(result).sort()).toEqual(
				result.status === "completed"
					? ["cursorAfter", "cursorBefore", "reason", "status", "toolCalls"]
					: ["cursorAfter", "cursorBefore", "error", "reason", "status", "toolCalls"],
			);
			expect(JSON.stringify(result)).not.toContain(secret);
			expect(result).not.toHaveProperty("prompt");
			expect(result).not.toHaveProperty("messages");
			expect(result).not.toHaveProperty("model");
		}
	});

	it("MEM-RUN-012 失败后可复用且不保留 active、消息或计数", async () => {
		const harness = createHarness({
			responses: [
				fauxAssistantMessage("provider failed", {
					stopReason: "error",
					errorMessage: "temporary",
				}),
			],
		});

		const first = await harness.runner.run(harness.input);
		harness.appendResponses([
			fauxAssistantMessage(refineCall(), { stopReason: "toolUse" }),
			fauxAssistantMessage("completed"),
		]);
		const second = await harness.runner.run(harness.input);

		expect(first).toMatchObject({ status: "failed", toolCalls: 0 });
		expect(second).toMatchObject({ status: "completed", toolCalls: 1, cursorAfter: 5 });
		expect(harness.contexts).toHaveLength(3);
		expect(harness.contexts[1]?.messages).toHaveLength(1);
		expect(JSON.stringify(harness.contexts[1])).not.toContain("provider failed");
	});
});

// #endregion
