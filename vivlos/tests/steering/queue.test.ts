/**
 * SteeringQueue 单元测试。
 *
 * 覆盖 push/drain/clear 语义、去重、consumed/dropped 事件。
 */

import { describe, expect, it } from "vitest";

import { createSteeringQueue } from "@vivlos/agent/steering/queue.ts";
import {
	createEventBus,
	type SteeringConsumedEvent,
	type SteeringDroppedEvent,
	type VivlosEvent,
} from "@vivlos/infra/eventbus/index.ts";

function setup() {
	const eventBus = createEventBus();
	const events: VivlosEvent[] = [];
	eventBus.on("steering:consumed", (e) => {
		events.push(e);
	});
	eventBus.on("steering:dropped", (e) => {
		events.push(e);
	});
	const queue = createSteeringQueue({
		eventBus,
		getSessionId: () => "session-a",
	});
	return { queue, events };
}

describe("SteeringQueue push & dedup", () => {
	it("STEER-001 push 返回 id 且未去重", () => {
		const { queue } = setup();
		const result = queue.push("第一条");
		expect(result.deduplicated).toBe(false);
		expect(result.id).toBeTruthy();
		expect(queue.size()).toBe(1);
	});

	it("STEER-002 相同文本未消费时去重复用 id", () => {
		const { queue } = setup();
		const first = queue.push("同样的话");
		const second = queue.push("同样的话");
		expect(second.deduplicated).toBe(true);
		expect(second.id).toBe(first.id);
		expect(queue.size()).toBe(1);
	});

	it("STEER-003 不同文本分别入队", () => {
		const { queue } = setup();
		const a = queue.push("甲");
		const b = queue.push("乙");
		expect(a.id).not.toBe(b.id);
		expect(queue.size()).toBe(2);
	});
});

describe("SteeringQueue drain", () => {
	it("STEER-004 drain 返回消息并发 consumed 事件", () => {
		const { queue, events } = setup();
		const a = queue.push("消息甲");
		const b = queue.push("消息乙");

		const messages = queue.drain();

		expect(messages).toHaveLength(2);
		expect(messages[0]?.role).toBe("user");
		expect(queue.size()).toBe(0);
		const consumed = events.filter(
			(e): e is SteeringConsumedEvent => e.type === "steering:consumed",
		);
		expect(consumed).toHaveLength(1);
		expect(consumed[0]!.sessionId).toBe("session-a");
		expect(consumed[0]!.ids).toEqual([a.id, b.id]);
	});

	it("STEER-005 空队列 drain 不发事件", () => {
		const { queue, events } = setup();
		expect(queue.drain()).toEqual([]);
		expect(events).toHaveLength(0);
	});

	it("STEER-006 消费后再 push 相同文本视为全新（不去重）", () => {
		const { queue } = setup();
		const first = queue.push("会重复的话");
		queue.drain();
		const again = queue.push("会重复的话");
		expect(again.deduplicated).toBe(false);
		expect(again.id).not.toBe(first.id);
	});
});

describe("SteeringQueue clear", () => {
	it("STEER-007 clear 丢弃并发 dropped 事件", () => {
		const { queue, events } = setup();
		const a = queue.push("没发出去的话");

		queue.clear();

		expect(queue.size()).toBe(0);
		const dropped = events.filter(
			(e): e is SteeringDroppedEvent => e.type === "steering:dropped",
		);
		expect(dropped).toHaveLength(1);
		expect(dropped[0]!.sessionId).toBe("session-a");
		expect(dropped[0]!.ids).toEqual([a.id]);
	});

	it("STEER-008 空队列 clear 不发事件", () => {
		const { queue, events } = setup();
		queue.clear();
		expect(events).toHaveLength(0);
	});

	it("STEER-009 drain 与 clear 互斥：先 drain 后 clear 无 dropped", () => {
		const { queue, events } = setup();
		queue.push("先被消费");
		queue.drain();
		queue.clear();
		const dropped = events.filter((e) => e.type === "steering:dropped");
		expect(dropped).toHaveLength(0);
	});
});
