/**
 * MemoryCoordinator 生命周期分发测试。
 *
 * 验证钩子注册、按序执行、失败隔离与异步处理器支持。
 */

import { describe, expect, it } from "vitest";

import { createMemoryCoordinator } from "@vivlos/agent/memory/index.ts";

describe("createMemoryCoordinator", () => {
	it("按注册顺序执行 afterTurn 钩子", async () => {
		const coordinator = createMemoryCoordinator();
		const order: string[] = [];
		coordinator.onAfterTurn(() => {
			order.push("first");
		});
		coordinator.onAfterTurn(() => {
			order.push("second");
		});

		await coordinator.afterTurn({ sessionId: "s1" });

		expect(order).toEqual(["first", "second"]);
	});

	it("beforeTurn 传递 sessionId 与 userText", async () => {
		const coordinator = createMemoryCoordinator();
		let received: { sessionId: string; userText: string } | undefined;
		coordinator.onBeforeTurn((context) => {
			received = { sessionId: context.sessionId, userText: context.userText };
		});

		await coordinator.beforeTurn({ sessionId: "s2", userText: "你好" });

		expect(received).toEqual({ sessionId: "s2", userText: "你好" });
	});

	it("sessionDelete 传递被删除的 sessionId", async () => {
		const coordinator = createMemoryCoordinator();
		const deleted: string[] = [];
		coordinator.onSessionDelete((sessionId) => {
			deleted.push(sessionId);
		});

		await coordinator.sessionDelete("s3");

		expect(deleted).toEqual(["s3"]);
	});

	it("支持异步处理器", async () => {
		const coordinator = createMemoryCoordinator();
		const order: string[] = [];
		coordinator.onAfterTurn(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			order.push("async");
		});
		coordinator.onAfterTurn(() => {
			order.push("sync");
		});

		await coordinator.afterTurn({ sessionId: "s4" });

		expect(order).toEqual(["async", "sync"]);
	});

	it("单个钩子失败不影响后续钩子", async () => {
		const coordinator = createMemoryCoordinator();
		const order: string[] = [];
		coordinator.onAfterTurn(() => {
			order.push("before-error");
		});
		coordinator.onAfterTurn(() => {
			throw new Error("boom");
		});
		coordinator.onAfterTurn(() => {
			order.push("after-error");
		});

		await coordinator.afterTurn({ sessionId: "s5" });

		expect(order).toEqual(["before-error", "after-error"]);
	});

	it("异步钩子 reject 也被隔离", async () => {
		const coordinator = createMemoryCoordinator();
		const order: string[] = [];
		coordinator.onSessionDelete(async () => {
			throw new Error("async boom");
		});
		coordinator.onSessionDelete(() => {
			order.push("ok");
		});

		await coordinator.sessionDelete("s6");

		expect(order).toEqual(["ok"]);
	});

	it("无注册钩子时调用安全返回", async () => {
		const coordinator = createMemoryCoordinator();
		await expect(
			coordinator.beforeTurn({ sessionId: "s7", userText: "" }),
		).resolves.toBeUndefined();
		await expect(
			coordinator.afterTurn({ sessionId: "s7" }),
		).resolves.toBeUndefined();
		await expect(coordinator.sessionDelete("s7")).resolves.toBeUndefined();
	});
});
