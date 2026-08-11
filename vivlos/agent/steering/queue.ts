/**
 * Steering 队列：运行中插话（btw / 纠偏）的待注入消息队列。
 *
 * 单一队列由两个 pi 钩子共用排空：
 *   - getSteeringMessages —— run 开始 / 每个 turn 边界（运行中纠偏）
 *   - getFollowUpMessages —— agent 即将退出前（兜住"极晚窗口"）
 * run 结束由 agent.prompt() 调 clear() 兜底，丢弃未消费消息，
 * 防止其被下一轮 run-start 的 steering 静默注入 / 重发导致重复消费。
 *
 * 注入的消息由 pi push 进 loop 返回序列，随 Vivlos canonical 落盘，
 * 本模块不负责持久化。
 */

import { randomUUID } from "node:crypto";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";

/** 排队中的消息条目。 */
interface QueuedMessage {
	readonly id: string;
	readonly text: string;
	readonly message: AgentMessage;
}

export interface SteeringQueue {
	/**
	 * 入队并去重。与"仍在队列中（未消费）"的消息比对文本，
	 * 相同则复用其 id、不新建。
	 */
	push(text: string): { id: string; deduplicated: boolean };
	/** 排空并返回 AgentMessage[]（供 pi 钩子）；对消费 id 发 steering:consumed。 */
	drain(): AgentMessage[];
	/** 清空丢弃（run 结束兜底）；对丢弃 id 发 steering:dropped。 */
	clear(): void;
	/** 当前排队条数（测试/调试用）。 */
	size(): number;
}

export interface SteeringQueueDeps {
	readonly eventBus: EventBus;
	/** 事件携带的当前 session id。 */
	readonly getSessionId: () => string;
}

function userMessage(text: string): AgentMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
		timestamp: Date.now(),
	};
}

export function createSteeringQueue(deps: SteeringQueueDeps): SteeringQueue {
	let items: QueuedMessage[] = [];

	return {
		push(text) {
			const existing = items.find((item) => item.text === text);
			if (existing) return { id: existing.id, deduplicated: true };
			const id = randomUUID().slice(0, 8);
			items.push({ id, text, message: userMessage(text) });
			return { id, deduplicated: false };
		},

		drain() {
			if (items.length === 0) return [];
			const drained = items;
			items = [];
			deps.eventBus.emit({
				type: "steering:consumed",
				sessionId: deps.getSessionId(),
				ids: drained.map((item) => item.id),
			});
			return drained.map((item) => item.message);
		},

		clear() {
			if (items.length === 0) return;
			const dropped = items;
			items = [];
			deps.eventBus.emit({
				type: "steering:dropped",
				sessionId: deps.getSessionId(),
				ids: dropped.map((item) => item.id),
			});
		},

		size() {
			return items.length;
		},
	};
}
