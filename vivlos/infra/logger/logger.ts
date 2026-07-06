import type { EventBus } from "@vivlos/infra/eventbus/index.ts";

/** 全局 eventBus 引用（main.ts 启动时注入） */
let bus: EventBus | null = null;

/**
 * 初始化 logger（main.ts 启动时调用一次）。
 *
 * 注入 eventBus 后，全局 log() 即可通过 eventbus "log" 通道发出事件，
 * MarkdownLogWriter 自动捕获并写入 .md 文件。
 */
export function initLogger(eventBus: EventBus): void {
	bus = eventBus;
}

/**
 * 全局 log 函数。
 *
 * 类似 Java log4j——任意脚本 import 即可调用，不需要传 eventBus。
 * 内部通过 eventbus "log" 通道发出事件，由 MarkdownLogWriter 持久化。
 *
 * @param level "error" | "warn" | "info"
 * @param message 日志内容
 * @param error   可选 Error 对象（VivlosError 实例会被 toLogLine() 结构化输出）
 */
export function log(
	level: "info" | "warn" | "error",
	message: string,
	error?: Error,
): void {
	if (!bus) return;
	bus.emit({ type: "log", level, message, error });
}