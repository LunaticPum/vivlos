import type { EventBus, VivlosEvent } from "@vivlos/infra/eventbus/index.ts";
import { mkdirSync, appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Markdown 日志写入器。
 *
 * 订阅 eventbus 的 "log" 通道，将日志事件写入本地 .md 文件。
 * 按 session 分文件，按 level 分块。
 *
 * 依赖：eventbus（infra 内依赖，不违反洋葱）。
 * 激活：main.ts 中 startMarkdownLogger(eventBus)。
 */
export interface MarkdownLogWriter {
	/** 启动日志监听（订阅 eventbus） */
	start(): void;
	/** 停止并关闭文件 */
	stop(): void;
}

export interface MarkdownLogConfig {
	/** 日志目录，默认 ~/.vivlos/logs */
	logDir: string;
	/** session ID，用于日志文件名 */
	sessionId: string;
}

export function createMarkdownLogWriter(
	eventBus: EventBus,
	config: MarkdownLogConfig,
): MarkdownLogWriter {
	const { logDir, sessionId } = config;

	// 确保日志目录存在
	if (!existsSync(logDir)) {
		mkdirSync(logDir, { recursive: true });
	}

	const filePath = resolve(logDir, `session-${sessionId}.md`);

	// 写文件头
	const header = `# vivlos session log: ${sessionId}\n\n> started: ${new Date().toISOString()}\n\n---\n\n`;
	appendFileSync(filePath, header, "utf-8");

	let unsubscribe: (() => void) | null = null;

	return {
		start() {
			// 日志收集的 EventBus 订阅
			unsubscribe = eventBus.on("log", (e) => {
				const line = formatLogLine(e);
				appendFileSync(filePath, line, "utf-8");
			});
		},

		stop() {
			unsubscribe?.();
			const tail = `\n---\n\n> closed: ${new Date().toISOString()}\n`;
			appendFileSync(filePath, tail, "utf-8");
		},
	};
}

/** 格式化单条日志 */
function formatLogLine(event: Extract<VivlosEvent, { type: "log" }>): string {
	const timestamp = new Date().toISOString();
	const level = event.level.toUpperCase();
	const message = escapeMarkdown(event.message);
	return `## ${timestamp} [${level}]\n\n${message}\n\n`;
}

/** 转义 Markdown 特殊字符 */
function escapeMarkdown(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/\*/g, "\\*")
		.replace(/_/g, "\\_")
		.replace(/`/g, "\\`");
}
