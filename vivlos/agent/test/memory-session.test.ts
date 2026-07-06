import { describe, it, expect } from "vitest";
import { createSessionManager } from "../session/manager.ts";

describe("createSessionManager (内存模式)", () => {
	it("默认生成 id", () => {
		const session = createSessionManager();
		expect(session.id).toBeTruthy();
		expect(typeof session.id).toBe("string");
	});

	it("接受自定义 id", () => {
		const session = createSessionManager({ id: "my-id" });
		expect(session.id).toBe("my-id");
	});

	it("appendMessage 增加消息", () => {
		const session = createSessionManager();
		expect(session.getMessages().length).toBe(0);

		session.appendMessage({
			role: "user",
			content: "你好",
			timestamp: Date.now(),
		});

		expect(session.getMessages().length).toBe(1);
		expect(session.getMessages()[0]!.role).toBe("user");
	});

	it("reset 清空消息", () => {
		const session = createSessionManager();
		session.appendMessage({
			role: "user",
			content: "hi",
			timestamp: Date.now(),
		});
		expect(session.getMessages().length).toBe(1);

		session.reset();
		expect(session.getMessages().length).toBe(0);
	});

	it("不可变返回 - appendMessage 不修改原数组引用", () => {
		const session = createSessionManager();
		const msgs1 = session.getMessages();
		session.appendMessage({
			role: "user",
			content: "hi",
			timestamp: Date.now(),
		});
		const msgs2 = session.getMessages();
		// 内部用 spread 创建新数组，第一份应不受影响
		expect(msgs1.length).toBe(0);
		expect(msgs2.length).toBe(1);
	});
});