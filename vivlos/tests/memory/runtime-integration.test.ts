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
import type { Api, Context, Model } from "@earendil-works/pi-ai";
import {
	createFauxCore,
	fauxAssistantMessage,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAgent, createPromptBuilder } from "@vivlos/agent/index.ts";
import { createMemoryRuntime } from "@vivlos/agent/memory-refactor/index.ts";
import { createMemoryTool } from "@vivlos/agent/tools/advanced/memory/memory.ts";
import { createMemoryEventLogger } from "@vivlos/agent/memory-refactor/utils/event-logger.ts";
import type { SessionManager } from "@vivlos/agent/session/index.ts";
import { createEventBus, type MemoryOperationEvent } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/types.ts";
import {
	createMemoryRepository,
	type MemoryLimits,
} from "@vivlos/infra/storage/memory/index.ts";
import type { MemoryOperationContext } from "@vivlos/agent/memory-refactor/service.ts";

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

		const toolResult = await tool.execute("call-capacity", {
			action: "add",
			file: "memory",
			content: "Too large",
			reasonCode: "explicit_user_request",
		});
		expect(JSON.stringify(toolResult)).toContain("capacity_exceeded");
		await runtime.prepare(model);
		dispose();

		expect(faux.state.callCount).toBe(1);
		expect(repo.readSnapshot().entries.memory).toEqual(["Existing"]);
		expect(runtime.buildPrompt()).toContain("Existing");
	});

	it("MEM-INT-005 其他 session 的 changed 不失效当前 PromptBuilder", () => {
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

	it("MEM-INT-006 Logger 对每条 operation 只追加一行", () => {
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
