/**
 * Memory 核心运行链集成测试。
 *
 * 使用临时 session、内存 SessionManager 和 pi-ai faux provider；不启动 TUI、读取
 * .env 或连接真实 Provider。
 */

import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Type, type Api, type Context, type Model } from "@earendil-works/pi-ai";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAgent, createPromptBuilder } from "@vivlos/agent/index.ts";
import { createMemoryRuntime } from "@vivlos/agent/memory/index.ts";
import { createMemoryTool } from "@vivlos/agent/tools/advanced/memory/memory.ts";
import { createTodoTools } from "@vivlos/agent/tools/advanced/todo/todo.ts";
import {
	readTodoList,
	writeTodoList,
} from "@vivlos/agent/tools/advanced/todo/storage.ts";
import { createMemoryEventLogger } from "@vivlos/agent/memory/utils/event-logger.ts";
import type { SessionManager } from "@vivlos/agent/session/index.ts";
import { createEventBus, type MemoryOperationEvent } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/types.ts";
import {
	createMemoryRepository,
	type MemoryLimits,
} from "@vivlos/infra/storage/memory/index.ts";
import type { MemoryOperationContext } from "@vivlos/agent/memory/layers/l1/service.ts";

const LIMITS = { memory: 100, user: 100 } as const;
const CONFIG = {
	model: null,
	trigger: { operations: 20, capacity: 0.85 },
	maxTurns: 6,
	maxTools: 8,
	timeoutMs: 1_000,
} as const;

let tempRoot: string;

beforeEach(() => {
	tempRoot = mkdtempSync(join(tmpdir(), "vivlos-memory-integration-"));
});

afterEach(() => {
	rmSync(tempRoot, { recursive: true, force: true });
});

function session(id: string, directory: string): SessionManager {
	let messages: AgentMessage[] = [];
	return {
		id,
		name: null,
		pending: false,
		filePath: join(directory, "history.jsonl"),
		dirPath: directory,
		resolveDir: (sessionId) => sessionId === id ? directory : undefined,
		getMessages: () => messages as never,
		activate: () => false,
		appendMessage: (message) => messages.push(message),
		replaceMessages: (next) => { messages = [...next]; },
		listSessions: () => [],
		switchTo: () => {},
		createNew: () => {},
		deleteSession: () => false,
		rename: () => {},
		renameIfUnnamed: () => false,
	};
}

function modelFrom(faux: ReturnType<typeof createFauxCore>): Model<Api> {
	const model = faux.getModel() as Model<Api>;
	model.contextWindow = 0;
	return model;
}

function llmFrom(
	faux: ReturnType<typeof createFauxCore>,
	model: Model<Api>,
): LLMClient {
	return {
		getModel: (provider, id) => provider === model.provider && id === model.id ? model : undefined,
		listModels: () => [model],
		listProviders: () => [model.provider],
		stream: (requested, context, options) =>
			faux.streamSimple(requested as Model<string>, context, options),
		setCredential: async () => {},
		hasCredential: async () => false,
		getDefaultProvider: () => model.provider,
		getDefaultModelId: () => model.id,
		setDefault: () => {},
		addCustomProvider: () => model.provider,
		removeProvider: () => {},
	};
}

function runtimeFor(
	eventBus: ReturnType<typeof createEventBus>,
	manager: SessionManager,
	llm: LLMClient,
	limits: MemoryLimits = LIMITS,
) {
	return createMemoryRuntime({
		eventBus,
		llm,
		sessionManager: manager,
		limits,
		config: CONFIG,
	});
}

function operation(
	sessionId: string,
	overrides: Partial<MemoryOperationEvent> = {},
): MemoryOperationEvent {
	return {
		type: "memory:operation",
		eventId: "operation-1",
		timestamp: 1,
		sessionId,
		actor: "main",
		action: "add",
		outcome: "committed",
		file: "memory",
		reasonCode: "explicit_user_request",
		after: "Stored fact.",
		revisionBefore: "before",
		revisionAfter: "after",
		...overrides,
	};
}

describe("Memory runtime integration", () => {
	it("MEM-INT-001 主 Tool 使用当前 session Service 并保留 reason", async () => {
		const eventBus = createEventBus();
		const sessionDir = join(tempRoot, "session-a");
		const manager = session("session-a", sessionDir);
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		const runtime = runtimeFor(eventBus, manager, llmFrom(faux, model));
		const events: MemoryOperationEvent[] = [];
		eventBus.on("memory:operation", (event) => { events.push(event); });
		const tool = createMemoryTool({
			getMemoryService: () => runtime.getService(),
			getMemoryOperationContext: (_command, reasonCode, reason): MemoryOperationContext => ({
				sessionId: manager.id,
				reasonCode,
				reason,
			}),
		});

		await tool.execute("call-1", {
			action: "add",
			file: "memory",
			content: "Stored fact.",
			reasonCode: "explicit_user_request",
			reason: "用户要求记住",
		});

		expect(events[0]).toMatchObject({
			sessionId: "session-a",
			reasonCode: "explicit_user_request",
			reason: "用户要求记住",
		});
		expect(runtime.buildPrompt()).toContain("Stored fact.");
	});

	it("MEM-INT-002 同一 Agent Loop 的下一次推理使用新 L1", async () => {
		const eventBus = createEventBus();
		const manager = session("session-a", join(tempRoot, "session-a"));
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		const contexts: Context[] = [];
		faux.setResponses([
			(context) => {
				contexts.push(context);
				return fauxAssistantMessage(
					fauxToolCall("memory", {
					action: "add",
					file: "memory",
					content: "Added during this turn.",
					reasonCode: "explicit_user_request",
					}),
					{ stopReason: "toolUse" },
				);
			},
			(context) => {
				contexts.push(context);
				return fauxAssistantMessage("继续完成");
			},
		]);
		const llm = llmFrom(faux, model);
		const runtime = runtimeFor(eventBus, manager, llm);
		const promptBuilder = createPromptBuilder();
		eventBus.on("memory:changed", (event) => {
			if (event.sessionId === manager.id) promptBuilder.invalidate();
		});
		const tool = createMemoryTool({
			getMemoryService: () => runtime.getService(),
			getMemoryOperationContext: (_command, reasonCode, reason) => ({
				sessionId: manager.id,
				reasonCode,
				...(reason ? { reason } : {}),
			}),
		});
		const agent = createAgent({
			llm,
			eventBus,
			model,
			memoryRuntime: runtime,
			promptBuilder,
			sessionManager: manager,
			tools: [tool],
			maxTurns: 3,
		});

		await agent.prompt("记住这条信息");

		expect(contexts).toHaveLength(2);
		expect(contexts[0]?.systemPrompt).not.toContain("Added during this turn.");
		expect(contexts[1]?.systemPrompt).toContain("Added during this turn.");
	});

	it("MEM-INT-003 session 切换后隔离 Memory Prompt", () => {
		const eventBus = createEventBus();
		let currentId = "session-a";
		let currentDir = join(tempRoot, "session-a");
		const manager = session(currentId, currentDir);
		Object.defineProperties(manager, {
			id: { get: () => currentId },
			dirPath: { get: () => currentDir },
		});
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		const runtime = runtimeFor(eventBus, manager, llmFrom(faux, model), {
			memory: 9,
			user: 100,
		});
		createMemoryRepository(currentDir, LIMITS).write("memory", ["Session A fact."]);
		expect(runtime.buildPrompt()).toContain("Session A fact.");

		currentId = "session-b";
		currentDir = join(tempRoot, "session-b");
		runtime.reset();

		expect(runtime.buildPrompt()).not.toContain("Session A fact.");
	});

	it("MEM-INT-004 capacity request 触发一次 main_request 整理且不重放命令", async () => {
		const eventBus = createEventBus();
		const sessionDir = join(tempRoot, "session-a");
		const manager = session("session-a", sessionDir);
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		faux.setResponses([fauxAssistantMessage("整理完成")]);
		const runtime = runtimeFor(eventBus, manager, llmFrom(faux, model), {
			memory: 9,
			user: 100,
		});
		const repo = createMemoryRepository(sessionDir, { memory: 9, user: 100 });
		repo.write("memory", ["Existing"]);
		const dispose = createMemoryEventLogger(eventBus, () => sessionDir);
		const tool = createMemoryTool({
			getMemoryService: () => runtime.getService(),
			getMemoryOperationContext: (_command, reasonCode) => ({
				sessionId: manager.id,
				reasonCode,
			}),
			onCapacityExceeded: (command, result) => runtime.recordMainResult(command, result),
		});

		await expect(tool.execute("call-capacity", {
			action: "add",
			file: "memory",
			content: "Too large",
			reasonCode: "explicit_user_request",
		})).rejects.toThrow("[capacity_exceeded]");
		await runtime.prepare(model);
		dispose();

		expect(faux.state.callCount).toBe(1);
		expect(repo.readSnapshot().entries.memory).toEqual(["Existing"]);
		expect(runtime.buildPrompt()).toContain("Existing");
	});

	it("MEM-INT-005 Memory 拒绝在 Agent Loop 中标记为 Tool Error", async () => {
		const eventBus = createEventBus();
		const sessionDir = join(tempRoot, "session-a");
		const manager = session("session-a", sessionDir);
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		const contexts: Context[] = [];
		faux.setResponses([
			fauxAssistantMessage(
				fauxToolCall("memory", {
					action: "add",
					file: "memory",
					content: "Too large",
					reasonCode: "explicit_user_request",
				}),
				{ stopReason: "toolUse" },
			),
			(context) => {
				contexts.push(context);
				return fauxAssistantMessage("未保存");
			},
		]);
		const llm = llmFrom(faux, model);
		const runtime = runtimeFor(eventBus, manager, llm, { memory: 4, user: 100 });
		const tool = createMemoryTool({
			getMemoryService: () => runtime.getService(),
			getMemoryOperationContext: (_command, reasonCode) => ({
				sessionId: manager.id,
				reasonCode,
			}),
		});
		const successes: boolean[] = [];
		let changed = 0;
		eventBus.on("agent:toolCall_end", (event) => { successes.push(event.success); });
		eventBus.on("memory:changed", () => { changed++; });
		const agent = createAgent({
			llm,
			eventBus,
			model,
			memoryRuntime: runtime,
			sessionManager: manager,
			tools: [tool],
			maxTurns: 3,
		});

		await agent.prompt("记住过长内容");

		const toolResults = manager.getMessages().filter((message) => message.role === "toolResult");
		expect(toolResults).toHaveLength(1);
		expect(toolResults[0]).toMatchObject({ isError: true });
		expect(JSON.stringify(toolResults[0])).toContain("capacity_exceeded");
		expect(successes).toEqual([false]);
		expect(changed).toBe(0);
		expect(contexts).toHaveLength(1);
	});

	it("MEM-INT-006 同一轮执行独立的 Memory 与 Todo Replace", async () => {
		const eventBus = createEventBus();
		const sessionDir = join(tempRoot, "session-a");
		const manager = session("session-a", sessionDir);
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		const contexts: Context[] = [];
		expect(writeTodoList(sessionDir, {
			description: "旧计划",
			status: "active",
			pendingList: [{ orderNum: 1 }],
			items: [{ orderNum: 1, content: "旧任务", status: "pending" }],
		}).ok).toBe(true);
		faux.setResponses([
			fauxAssistantMessage([
				fauxToolCall("memory", {
					action: "add",
					file: "memory",
					content: "不编写配置文档。",
					reasonCode: "stable_project_decision",
				}),
				fauxToolCall("todo_replace", {
					description: "设计讨论",
					items: [{ content: "讨论动画状态", priority: "high" }],
				}),
			], { stopReason: "toolUse" }),
			(context) => {
				contexts.push(context);
				return fauxAssistantMessage("两项操作完成");
			},
		]);
		const llm = llmFrom(faux, model);
		const runtime = runtimeFor(eventBus, manager, llm);
		const memoryTool = createMemoryTool({
			getMemoryService: () => runtime.getService(),
			getMemoryOperationContext: (_command, reasonCode) => ({
				sessionId: manager.id,
				reasonCode,
			}),
		});
		const todoReplace = createTodoTools({
			eventBus,
			getSessionId: () => manager.id,
			getSessionDir: () => sessionDir,
			tasksDir: join(tempRoot, "tasks"),
		}).find((tool) => tool.name === "todo_replace");
		if (!todoReplace) throw new Error("Missing todo_replace");
		const agent = createAgent({
			llm,
			eventBus,
			model,
			memoryRuntime: runtime,
			sessionManager: manager,
			tools: [memoryTool, todoReplace],
			maxTurns: 3,
		});

		await agent.prompt("记住约定并更新计划");

		const toolResults = manager.getMessages().filter((message) => message.role === "toolResult");
		expect(toolResults).toHaveLength(2);
		expect(toolResults.every((message) => message.isError === false)).toBe(true);
		expect(runtime.buildPrompt()).toContain("不编写配置文档。");
		expect(readTodoList(sessionDir)).toMatchObject({
			ok: true,
			value: {
				description: "设计讨论",
				items: [{ content: "讨论动画状态", priority: "high" }],
			},
		});
		expect(contexts).toHaveLength(1);
		expect(contexts[0]?.messages.filter((message) => message.role === "toolResult")).toHaveLength(2);
	});

	it("MEM-INT-007 Todo 参数失败后回灌错误并允许下一轮修正", async () => {
		const eventBus = createEventBus();
		const sessionDir = join(tempRoot, "session-a");
		const manager = session("session-a", sessionDir);
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		expect(writeTodoList(sessionDir, {
			description: "旧计划",
			status: "active",
			pendingList: [{ orderNum: 1 }],
			items: [{ orderNum: 1, content: "旧任务", status: "pending" }],
		}).ok).toBe(true);
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("todo_replace", {
				description: "损坏参数",
				items: '[{"content":"讨论动画状态","priority":medium}]',
			}), { stopReason: "toolUse" }),
			fauxAssistantMessage(fauxToolCall("todo_replace", {
				description: "修正参数",
				items: [{ content: "讨论动画状态", priority: "medium" }],
			}), { stopReason: "toolUse" }),
			fauxAssistantMessage("Todo 已修正"),
		]);
		const llm = llmFrom(faux, model);
		const runtime = runtimeFor(eventBus, manager, llm);
		const todoReplace = createTodoTools({
			eventBus,
			getSessionId: () => manager.id,
			getSessionDir: () => sessionDir,
			tasksDir: join(tempRoot, "tasks"),
		}).find((tool) => tool.name === "todo_replace");
		if (!todoReplace) throw new Error("Missing todo_replace");
		const agent = createAgent({
			llm,
			eventBus,
			model,
			memoryRuntime: runtime,
			sessionManager: manager,
			tools: [todoReplace],
			maxTurns: 4,
		});

		await agent.prompt("更新 Todo");

		const toolResults = manager.getMessages().filter((message) => message.role === "toolResult");
		expect(toolResults.map((message) => message.isError)).toEqual([true, false]);
		expect(JSON.stringify(toolResults[0])).toContain("items 必须直接传 JSON 数组");
		expect(readTodoList(sessionDir)).toMatchObject({
			ok: true,
			value: { description: "修正参数" },
		});
	});

	it("MEM-INT-008 maxTurns 截断未消费的 Tool Result 时返回错误", async () => {
		const eventBus = createEventBus();
		const manager = session("session-a", join(tempRoot, "session-a"));
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		faux.setResponses([
			fauxAssistantMessage(fauxToolCall("memory", {
				action: "add",
				file: "memory",
				content: "已写入但尚未消费结果。",
				reasonCode: "explicit_user_request",
			}), { stopReason: "toolUse" }),
			fauxAssistantMessage("不应执行"),
		]);
		const llm = llmFrom(faux, model);
		const runtime = runtimeFor(eventBus, manager, llm);
		const tool = createMemoryTool({
			getMemoryService: () => runtime.getService(),
			getMemoryOperationContext: (_command, reasonCode) => ({
				sessionId: manager.id,
				reasonCode,
			}),
		});
		let completed = 0;
		let errors = 0;
		eventBus.on("agent:complete", () => { completed++; });
		eventBus.on("agent:error", () => { errors++; });
		const agent = createAgent({
			llm,
			eventBus,
			model,
			memoryRuntime: runtime,
			sessionManager: manager,
			tools: [tool],
			maxTurns: 1,
		});

		const result = await agent.prompt("记住信息");

		expect(result.error?.message).toContain("达到最大轮次 1");
		expect(faux.state.callCount).toBe(1);
		expect(manager.getMessages().at(-1)?.role).toBe("toolResult");
		expect(runtime.buildPrompt()).toContain("已写入但尚未消费结果。");
		expect(completed).toBe(0);
		expect(errors).toBe(1);
	});

	it("MEM-INT-009 maxTurns 上限处的普通最终文本仍正常完成", async () => {
		const eventBus = createEventBus();
		const manager = session("session-a", join(tempRoot, "session-a"));
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		faux.setResponses([fauxAssistantMessage("正常完成")]);
		const llm = llmFrom(faux, model);
		const runtime = runtimeFor(eventBus, manager, llm);
		let completed = 0;
		eventBus.on("agent:complete", () => { completed++; });
		const agent = createAgent({
			llm,
			eventBus,
			model,
			memoryRuntime: runtime,
			sessionManager: manager,
			maxTurns: 1,
		});

		const result = await agent.prompt("直接回答");

		expect(result.error).toBeUndefined();
		expect(result.turns).toBe(1);
		expect(completed).toBe(1);
	});

	it("MEM-INT-010 maxTurns 上限处尊重 Tool terminate", async () => {
		const eventBus = createEventBus();
		const manager = session("session-a", join(tempRoot, "session-a"));
		Object.defineProperty(manager, "name", { value: "已有标题" });
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		faux.setResponses([fauxAssistantMessage(fauxToolCall("terminate_test", {}), {
			stopReason: "toolUse",
		})]);
		const llm = llmFrom(faux, model);
		const runtime = runtimeFor(eventBus, manager, llm);
		const tool = {
			name: "terminate_test",
			label: "Terminate test",
			description: "Terminate test",
			parameters: Type.Object({}),
			async execute() {
				return {
					content: [{ type: "text" as const, text: "已终止" }],
					details: {},
					terminate: true,
				};
			},
		};
		let completed = 0;
		eventBus.on("agent:complete", () => { completed++; });
		const agent = createAgent({
			llm,
			eventBus,
			model,
			memoryRuntime: runtime,
			sessionManager: manager,
			tools: [tool],
			maxTurns: 1,
		});

		const result = await agent.prompt("立即终止");

		expect(result.error).toBeUndefined();
		expect(faux.state.callCount).toBe(1);
		expect(completed).toBe(1);
	});

	it("MEM-INT-011 maxTurns 上限处中止时保留 aborted 分类", async () => {
		const eventBus = createEventBus();
		const manager = session("session-a", join(tempRoot, "session-a"));
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		faux.setResponses([fauxAssistantMessage(fauxToolCall("abort_test", {}), {
			stopReason: "toolUse",
		})]);
		const llm = llmFrom(faux, model);
		const runtime = runtimeFor(eventBus, manager, llm);
		const controller = new AbortController();
		const tool = {
			name: "abort_test",
			label: "Abort test",
			description: "Abort test",
			parameters: Type.Object({}),
			async execute() {
				controller.abort();
				throw new Error("aborted in tool");
			},
		};
		const kinds: string[] = [];
		eventBus.on("agent:error", (event) => { kinds.push(event.kind); });
		const agent = createAgent({
			llm,
			eventBus,
			model,
			memoryRuntime: runtime,
			sessionManager: manager,
			tools: [tool],
			maxTurns: 1,
		});

		const result = await agent.prompt("记住信息", controller.signal);

		expect(result.error?.message).toBe("Agent 操作已中止");
		expect(kinds).toEqual(["aborted"]);
	});

	it("MEM-INT-012 Tool terminate 与 Abort 同时发生时仍归类 aborted", async () => {
		const eventBus = createEventBus();
		const manager = session("session-a", join(tempRoot, "session-a"));
		Object.defineProperty(manager, "name", { value: "已有标题" });
		const faux = createFauxCore({ models: [{ id: "model-a" }] });
		const model = modelFrom(faux);
		faux.setResponses([fauxAssistantMessage(fauxToolCall("terminate_abort_test", {}), {
			stopReason: "toolUse",
		})]);
		const llm = llmFrom(faux, model);
		const runtime = runtimeFor(eventBus, manager, llm);
		const controller = new AbortController();
		const tool = {
			name: "terminate_abort_test",
			label: "Terminate abort test",
			description: "Terminate abort test",
			parameters: Type.Object({}),
			async execute() {
				controller.abort();
				return {
					content: [{ type: "text" as const, text: "已终止" }],
					details: {},
					terminate: true,
				};
			},
		};
		const kinds: string[] = [];
		let completed = 0;
		eventBus.on("agent:error", (event) => { kinds.push(event.kind); });
		eventBus.on("agent:complete", () => { completed++; });
		const agent = createAgent({
			llm,
			eventBus,
			model,
			memoryRuntime: runtime,
			sessionManager: manager,
			tools: [tool],
			maxTurns: 1,
		});

		const result = await agent.prompt("终止并取消", controller.signal);

		expect(result.error?.message).toBe("Agent 操作已中止");
		expect(kinds).toEqual(["aborted"]);
		expect(completed).toBe(0);
	});

	it("MEM-INT-013 其他 session 的 changed 不失效当前 PromptBuilder", () => {
		const eventBus = createEventBus();
		const promptBuilder = createPromptBuilder();
		promptBuilder.setMemory("Current fact");
		promptBuilder.freeze();
		const currentId = "session-a";
		eventBus.on("memory:changed", (event) => {
			if (event.sessionId === currentId) promptBuilder.invalidate();
		});

		eventBus.emit({
			type: "memory:changed",
			sessionId: "session-b",
			file: "memory",
			revisionBefore: "a",
			revisionAfter: "b",
		});

		expect(promptBuilder.isFrozen()).toBe(true);
	});

	it("MEM-INT-014 Logger 对每条 operation 只追加一行", () => {
		const eventBus = createEventBus();
		const sessionDir = join(tempRoot, "session-a");
		const dispose = createMemoryEventLogger(eventBus, () => sessionDir);
		eventBus.emit(operation("session-a", { eventId: "one" }));
		eventBus.emit(operation("session-a", { eventId: "two" }));
		dispose();

		const lines = readFileSync(join(sessionDir, "memory-events.jsonl"), "utf-8")
			.trim()
			.split("\n");
		expect(lines).toHaveLength(2);
		expect(existsSync(join(sessionDir, "memory-events.jsonl"))).toBe(true);
	});
});
