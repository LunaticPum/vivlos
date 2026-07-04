// vivlos/infra/eventbus/eventbus.test.ts
import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../index.js";

describe("EventBus", () => {
	it("emit + on 基本收发", () => {
		const bus = createEventBus();
		const received: string[] = [];

		bus.on("text:delta", (e) => {
			received.push(e.delta);
		});

		bus.emit({ type: "text:delta", sessionId: "s1", delta: "hello" });
		bus.emit({ type: "text:delta", sessionId: "s1", delta: "world" });

		expect(received).toEqual(["hello", "world"]);
	});

	it("on 返回取消订阅函数", () => {
		const bus = createEventBus();
		const fn = vi.fn();

		const off = bus.on("agent:start", fn);
		off();

		bus.emit({ type: "agent:start", sessionId: "s1" });
		expect(fn).not.toHaveBeenCalled();
	});

	it("handler 错误不会影响其他监听器", () => {
		const bus = createEventBus();
		const good: string[] = [];

		bus.on("text:delta", () => {
			throw new Error("boom");
		});
		bus.on("text:delta", (e) => {
			good.push(e.delta);
		});

		bus.emit({ type: "text:delta", sessionId: "s1", delta: "still works" });

		expect(good).toEqual(["still works"]);
	});

	it("clear 移除所有监听器", () => {
		const bus = createEventBus();
		const fn = vi.fn();

		bus.on("agent:complete", fn);
		bus.clear();

		bus.emit({ type: "agent:complete", sessionId: "s1", finalMessage: "done" });
		expect(fn).not.toHaveBeenCalled();
	});

	it("不同通道互不干扰", () => {
		const bus = createEventBus();
		const deltas: string[] = [];
		const starts: string[] = [];

		bus.on("text:delta", (e) => void deltas.push(e.delta));
		bus.on("agent:start", (e) => void starts.push(e.sessionId));

		bus.emit({ type: "text:delta", sessionId: "s1", delta: "hi" });
		bus.emit({ type: "agent:start", sessionId: "s2" });

		expect(deltas).toEqual(["hi"]);
		expect(starts).toEqual(["s2"]);
	});

	it("类型安全：handler 接收正确的事件类型", () => {
		const bus = createEventBus();

		bus.on("tool:call_start", (e) => {
			// TypeScript 确保 e 有 toolName 和 callId
			expect(e.toolName).toBeDefined();
			expect(e.callId).toBeDefined();
		});

		bus.emit({
			type: "tool:call_start",
			sessionId: "s1",
			toolName: "read_file",
			callId: "c1",
		});
	});
});
