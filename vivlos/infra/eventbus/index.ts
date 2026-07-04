import { EventEmitter } from "node:events";
import type { VivlosEvent } from "./types.ts";

export type { VivlosEvent } from "./types.ts";

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
			// 包装 handler：catch handler 内部的错误，防止单个监听器挂掉整条总线
			const safeHandler = async (event: VivlosEvent) => {
				try {
					await (handler as (e: VivlosEvent) => void | Promise<void>)(event);
				} catch (err) {
					// 先将错误信息打印到控制台上
					console.error(
						`Handler error on "${channel}": ${err instanceof Error ? err.message : String(err)}`,
					);

					// 再将错误信息广播到 log 通道上
					if (channel !== "log") {
						emitter.emit("log", {
							type: "log",
							level: "error",
							message: `Handler error on "${channel}": ${err instanceof Error ? err.message : String(err)}`,
						});
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
