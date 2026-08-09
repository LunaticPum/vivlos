import { EventEmitter } from "node:events";
import type { VivlosEvent } from "./types.ts";
import { log } from "@vivlos/infra/logger/index.ts";

export type {
	VivlosEvent,
	TodoPriority,
	TodoItemStatus,
	TodoListStatus,
	TodoItem,
	TodoList,
	OfferChoiceOption,
	OfferChoiceQuestion,
	OfferChoiceAnswer,
	MemoryOperationEvent,
	MemoryChangedEvent,
	MemoryOverviewRequestedEvent,
	MemoryOverviewEvent,
	MainAgentEvent,
	ConsolidateEvent,
	ConsolidateReason,
	ConsolidateStatus,
	ConsolidateError,
	MemoryEvent,
	SessionEvent,
	SessionStateSnapshot,
	AppEvent,
	WorkspaceEvent,
	DelegationEvent,
	DelegationTaskMessagesEvent,
} from "./types.ts";

/**
 * vivlos 事件总线接口。
 *
 * 通过构造器函数返回接口，所有通道都是已知的 VivlosEvent.type，不接受其他未定义的事件
 */
export interface EventBus {
	/** 发出一个事件，所有匹配的监听器都会被调用 */
	emit(event: VivlosEvent): void;

	/** 订阅某个通道，返回取消订阅函数 */
	on<T extends VivlosEvent["type"]>(
		channel: T,
		handler: (event: Extract<VivlosEvent, { type: T }>) => void | Promise<void>,
	): () => void;

	/** 移除所有监听器 */
	clear(): void;
}

export function createEventBus(): EventBus {
	const emitter = new EventEmitter();

	return {
		emit(event) {
			emitter.emit(event.type, event);
		},

		on(channel, handler) {
			// 包装 handler：catch 错误 → 通过全局 log() 写入持久化日志
			const safeHandler = async (event: VivlosEvent) => {
				try {
					await (handler as (e: VivlosEvent) => void | Promise<void>)(event);
				} catch (err) {
					const cause = err instanceof Error ? err : new Error(String(err));
					console.error(`事件处理器异常 (${channel}): ${cause.message}`);
						if (channel !== "log") {
							log("error", `事件处理器异常 (${channel}): ${cause.message}`, cause);
						}
				}
			};

			emitter.on(channel, safeHandler);
			return () => emitter.off(channel, safeHandler);
		},

		clear() {
			emitter.removeAllListeners();
		},
	};
}
