import { describe, it, expect } from "vitest";

// 类型主要靠编译期验证，这里只做基本构造测试
describe("types", () => {
	it("TokenUsage shape", () => {
		const usage = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 };
		expect(usage.input).toBe(100);
	});

	it("AgentConfig shape", () => {
		const cfg = { maxTurns: 50, modelId: "gpt-4o" };
		expect(cfg.maxTurns).toBe(50);
	});

	it("ChannelMessage shape", () => {
		const msg = {
			channel: "tui",
			senderId: "user",
			text: "hello",
			timestamp: Date.now(),
		};
		expect(msg.channel).toBe("tui");
	});
});
