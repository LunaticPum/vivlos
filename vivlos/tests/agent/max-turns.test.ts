import { describe, expect, it } from "vitest";

import { createMaxTurnsHook } from "@vivlos/agent/loop/hooks/max-turns.ts";

function turn(toolResults = 0) {
	return {
		newMessages: [],
		toolResults: Array.from({ length: toolResults }, () => ({ role: "toolResult" })),
	} as never;
}

describe("maxTurns hook", () => {
	it("MAX-001 跨底层 invocation 累计当前请求的 assistant turn", () => {
		const hook = createMaxTurnsHook(2);

		expect(hook.shouldStopAfterTurn(turn())).toBe(false);
		expect(hook.shouldStopAfterTurn(turn())).toBe(true);
	});

	it("MAX-002 上限处普通文本停止但不报告未消费 Tool Result", () => {
		let interrupted = 0;
		const hook = createMaxTurnsHook(1, () => { interrupted++; });

		expect(hook.shouldStopAfterTurn(turn())).toBe(true);
		expect(interrupted).toBe(0);
	});

	it("MAX-003 上限处存在 Tool Result 时报告截断", () => {
		let interrupted = 0;
		const hook = createMaxTurnsHook(1, () => { interrupted++; });

		expect(hook.shouldStopAfterTurn(turn(1))).toBe(true);
		expect(interrupted).toBe(1);
	});

	it("MAX-004 调用方确认 Tool Result 无需 follow-up 时不报告截断", () => {
		let interrupted = 0;
		const hook = createMaxTurnsHook(1, () => { interrupted++; });

		expect(hook.shouldStopAfterTurn(turn(1), false)).toBe(true);
		expect(interrupted).toBe(0);
	});
});
