import type { Component } from "@earendil-works/pi-tui";

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

/** 去掉 ANSI 转义码后取纯文本宽度 */
function visibleLen(text: string): number {
	return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** 按空格断词简单换行 */
function wrapLines(text: string, maxWidth: number): string[] {
	const result: string[] = [];
	for (const paragraph of text.split("\n")) {
		if (visibleLen(paragraph) <= maxWidth) {
			result.push(paragraph);
		} else {
			let remaining = paragraph;
			while (visibleLen(remaining) > maxWidth) {
				let cut = maxWidth;
				const spaceIdx = remaining.lastIndexOf(" ", maxWidth);
				if (spaceIdx > maxWidth / 2) cut = spaceIdx;
				result.push(remaining.slice(0, cut));
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
 *
 * 参照 pi :
 *   - Component 接口（render/invalidate）
 *   - Box.render() 的 RenderCache 模式（纯值比对、不清零）
 *   - DynamicBorder 的 width 参数动态线条
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
		// 缓存命中：text + width 都没变
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
		const labelLen = visibleLen(labelPart);
		const dashRight = Math.max(0, width - labelLen - 2);
		lines.push(c(`╭${labelPart}${"─".repeat(dashRight)}╮`));

		// │ content │
		const contentWidth = width - 4; // 左右各 "│ " + " │"
		const contentLines = wrapLines(this.text, Math.max(1, contentWidth));
		for (const contentLine of contentLines) {
			const pad = " ".repeat(Math.max(0, contentWidth - visibleLen(contentLine)));
			lines.push(`${c("│")} ${contentLine}${pad} ${c("│")}`);
		}

		// ╰──...──╯
		lines.push(c(`╰${"─".repeat(width - 2)}╯`));

		this.cache = { text: this.text, width, lines };
		return lines;
	}
}