import type { EventBus, VivlosEvent } from "@vivlos/infra/eventbus/index.ts";
import { mkdirSync, appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { VivlosError } from "@vivlos/shared/errors.ts";

/**
 * Markdown 日志写入器。
 *
 * 订阅 eventbus 的 "log" 通道，将日志事件写入本地 .md 文件。
 * 按 session 分文件，按 level 分块。
 * 检测 VivlosError 实例时调用 toLogLine() 输出结构化明细。
 *
 * 依赖：eventbus（infra 内依赖，不违反洋葱）。
 * 激活：main.ts 中 startMarkdownLogger(eventBus)。
 */
export interface MarkdownLogWriter {
	start(): void;
	stop(): void;
}

export interface MarkdownLogConfig {
	readonly logDir: string;
	readonly sessionId: string;
}

export function createMarkdownLogWriter(
	eventBus: EventBus,
	config: MarkdownLogConfig,
): MarkdownLogWriter {
	const { logDir, sessionId } = config;

	if (!existsSync(logDir)) {
		mkdirSync(logDir, { recursive: true });
	}

	const filePath = resolve(logDir, `session-${sessionId}.md`);

	const header = `# vivlos session log: ${sessionId}\n\n> started: ${new Date().toISOString()}\n\n---\n\n`;
	appendFileSync(filePath, header, "utf-8");

	let unsubscribe: (() => void) | null = null;

	return {
		start() {
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

	// 如果有关联 VivlosError，用 toLogLine() 输出结构化明细
	let body: string;
	if (event.error instanceof VivlosError) {
		body = `\`\`\`\n${event.error.toLogLine()}\n\`\`\``;
	} else if (event.error) {
		body = `\`\`\`\n${event.error.name}: ${event.error.message}\n\`\`\``;
	} else {
		body = escapeMarkdown(event.message);
	}

	return `## ${timestamp} [${level}]\n\n${body}\n\n`;
}

/** 转义 Markdown 特殊字符 */
function escapeMarkdown(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/\*/g, "\\*")
		.replace(/_/g, "\\_")
		.replace(/`/g, "\\`");
}