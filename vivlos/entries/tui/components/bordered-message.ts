import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

/** ANSI 前景色 */
const FG = {
	cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,
	green: (t: string) => `\x1b[32m${t}\x1b[0m`,
	gray: (t: string) => `\x1b[90m${t}\x1b[0m`,
	red: (t: string) => `\x1b[31m${t}\x1b[0m`,
	yellow: (t: string) => `\x1b[33m${t}\x1b[0m`,
	blue: (t: string) => `\x1b[34m${t}\x1b[0m`,
	magenta: (t: string) => `\x1b[35m${t}\x1b[0m`,
} as const;

export type AnsiColor = keyof typeof FG;

/** 按空格断词换行（用 pi visibleWidth 正确计算宽字符） */
function wrapLines(text: string, maxWidth: number): string[] {
	const result: string[] = [];
	for (const paragraph of text.split("\n")) {
		if (visibleWidth(paragraph) <= maxWidth) {
			result.push(paragraph);
		} else {
			let remaining = paragraph;
			while (visibleWidth(remaining) > maxWidth) {
				// 先尝试在 maxWidth 以内的空格处断词
				let cut = maxWidth;
				let searchStart = 0;
				while (searchStart <= maxWidth && searchStart !== -1) {
					const idx = remaining.indexOf(" ", searchStart);
					if (idx === -1 || visibleWidth(remaining.slice(0, idx + 1)) > maxWidth) break;
					cut = idx;
					searchStart = idx + 1;
				}
				result.push(truncateToWidth(remaining, cut));
				remaining = remaining.slice(cut).trimStart();
			}
			if (remaining.length > 0) result.push(remaining);
		}
	}
	return result;
}

/** 参照 pi Box 的 RenderCache 模式 */
type Cache = {
	text: string;
	width: number;
	lines: string[];
};

/**
 * 带圆角彩色边框的消息组件。
 *
 * ╭── role ───────────────╮
 * │ message text ...        │
 * ╰────────────────────────╯
 */
export class BorderedMessage implements Component {
	private label: string;
	private text: string;
	private colorFn: (s: string) => string;
	private cache?: Cache;

	constructor(label: string, text: string, color: AnsiColor = "cyan") {
		this.label = label;
		this.text = text;
		this.colorFn = FG[color];
	}

	setText(text: string): void {
		this.text = text;
		this.cache = undefined;
	}

	setColor(color: AnsiColor): void {
		this.colorFn = FG[color];
		this.cache = undefined;
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		if (this.cache && this.cache.text === this.text && this.cache.width === width) {
			return this.cache.lines;
		}

		const c = this.colorFn;
		const lines: string[] = [];

		if (!this.text.trim()) {
			this.cache = { text: this.text, width, lines };
			return lines;
		}

		// ╭── Label ──...──╮
		const labelPart = `── ${this.label} ──`;
		const labelWidth = visibleWidth(labelPart);
		const dashRight = Math.max(0, width - labelWidth - 2);
		lines.push(c(`╭${labelPart}${"─".repeat(dashRight)}╮`));

		// │ content │
		const contentWidth = width - 4;
		const contentLines = wrapLines(this.text, Math.max(1, contentWidth));
		for (const contentLine of contentLines) {
			const lineWidth = visibleWidth(contentLine);
			const pad = " ".repeat(Math.max(0, contentWidth - lineWidth));
			const body = `${contentLine}${pad}`;
			lines.push(`${c("│")} ${truncateToWidth(body, contentWidth)} ${c("│")}`);
		}

		// ╰──...──╯
		lines.push(c(`╰${"─".repeat(width - 2)}╯`));

		this.cache = { text: this.text, width, lines };
		return lines;
	}
}