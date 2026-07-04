import {
	EventStream,
	type AssistantMessage,
	type AssistantMessageEvent,
	type Model,
	type Context,
	type AssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import { describe, it, expect } from "vitest";
import { createAgentLoop } from "../loop/agent-loop.ts";
import { createMemorySession } from "../session/memory-session.ts";
import { createPromptBuilder } from "../prompt/builder.ts";
import { createEventBus } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";

// ── mock 工具 ──

class MockStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(e) => e.type === "done" || e.type === "error",
			(e) => {
				if (e.type === "done") {
					return e.message;
				} else if (e.type === "error") {
					return e.error;
				}
				throw new Error("Unexpected event type for final result");
			},
		);
	}
}

function mockModel(): Model<"openai-responses"> {
	return {
		id: "mock",
		name: "mock",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 2048,
	};
}

function makeUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function mockLLMClient(replyText: string): LLMClient {
	return {
		getModel: () => mockModel(),
		listModels: () => [mockModel()],
		stream: (
			_model: Model<any>,
			_ctx: Context,
		): AssistantMessageEventStream => {
			const stream = new MockStream() as unknown as AssistantMessageEventStream;
			queueMicrotask(() => {
				const message: AssistantMessage = {
					role: "assistant",
					content: [{ type: "text", text: replyText }],
					api: "openai-responses",
					provider: "openai",
					model: "mock",
					usage: makeUsage(),
					stopReason: "stop",
					timestamp: Date.now(),
				};
				stream.push({ type: "done", reason: "stop", message });
			});
			return stream;
		},
	};
}

// ── 测试 ──

describe("createAgentLoop", () => {
	it("跑通一轮：user → assistant text → done", async () => {
		const eventBus = createEventBus();
		const receivedEvents: string[] = [];
		eventBus.on("agent:start", () => {
			receivedEvents.push("start");
		});
		eventBus.on("agent:turn_start", () => {
			receivedEvents.push("turn_start");
		});
		eventBus.on("text:delta", () => {
			receivedEvents.push("delta");
		});
		eventBus.on("text:complete", () => {
			receivedEvents.push("text_complete");
		});
		eventBus.on("agent:turn_complete", () => {
			receivedEvents.push("turn_complete");
		});
		eventBus.on("agent:complete", () => {
			receivedEvents.push("complete");
		});

		const loop = createAgentLoop({
			deps: { llm: mockLLMClient("你好！"), eventBus },
			session: createMemorySession(),
			promptBuilder: createPromptBuilder(),
		});

		const result = await loop.run("你好", { model: mockModel(), maxTurns: 5 });

		expect(result.turns).toBe(1);
		expect(result.error).toBeUndefined();
		expect(result.messages.length).toBeGreaterThan(0);
		expect(receivedEvents).toContain("start");
		expect(receivedEvents).toContain("turn_start");
		expect(receivedEvents).toContain("complete");
	});

	it("session 消息数量正确", async () => {
		const eventBus = createEventBus();
		const session = createMemorySession();

		const loop = createAgentLoop({
			deps: { llm: mockLLMClient("回复"), eventBus },
			session,
			promptBuilder: createPromptBuilder(),
		});

		await loop.run("你好", { model: mockModel(), maxTurns: 5 });

		// user (1) + assistant (1) = 2
		expect(session.getMessages().length).toBe(2);
		expect(session.getMessages()[0]!.role).toBe("user");
		expect(session.getMessages()[1]!.role).toBe("assistant");
	});

	it("LLM 返回 stopReason error 时发 agent:error 事件", async () => {
		const eventBus = createEventBus();
		const receivedEvents: string[] = [];
		eventBus.on("agent:start", () => { receivedEvents.push("start"); });
		eventBus.on("agent:turn_complete", () => { receivedEvents.push("turn_complete"); });
		eventBus.on("agent:complete", () => { receivedEvents.push("complete"); });
		eventBus.on("agent:error", () => { receivedEvents.push("error"); });

		const errorLLM: LLMClient = {
			getModel: () => mockModel(),
			listModels: () => [mockModel()],
			stream: () => {
				// 模拟 stream 推一个 error 事件
				const stream =
					new MockStream() as unknown as AssistantMessageEventStream;
				queueMicrotask(() => {
					const errorAssistant: AssistantMessage = {
						role: "assistant",
						content: [{ type: "text", text: "" }],
						api: "openai-responses",
						provider: "openai",
						model: "mock",
						usage: makeUsage(),
						stopReason: "error",
						errorMessage: "API down",
						timestamp: Date.now(),
					};
					stream.push({
						type: "error",
						reason: "error",
						error: errorAssistant,
					});
				});
				return stream;
			},
		};

		const loop = createAgentLoop({
			deps: { llm: errorLLM, eventBus },
			session: createMemorySession(),
			promptBuilder: createPromptBuilder(),
		});

		const result = await loop.run("你好", { model: mockModel(), maxTurns: 5 });

		// pi 把 stopReason: "error" 编码在 message 里，不算 throw
		// 走 turn_end → agent_end 正常事件流
		// event-mapper 在 turn_end 时检测 stopReason，额外发 agent:error
		expect(result.turns).toBe(1);
		expect(result.error).toBeUndefined();
		expect(receivedEvents).toContain("start");
		expect(receivedEvents).toContain("turn_complete");
		expect(receivedEvents).toContain("complete");
		expect(receivedEvents).toContain("error");
	});
});
