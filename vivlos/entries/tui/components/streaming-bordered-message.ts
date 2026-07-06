import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

/**
 * 流式输出的带边框消息组件。
 *
 * 流式开始即显示 ╭── vivlos ──╮ + │ 左右边框，
 * 文本逐字更新，结束时调用 finalize() 加上 ╰──╯ 底边框。
 */
export class StreamingBorderedMessage implements Component {
	private label: string;
	private text = "";
	private colorFn: (s: string) => string;
	private finalized = false;

	constructor(label: string, color: AnsiColor) {
		this.label = label;
		this.colorFn = FG[color];
	}

	setText(text: string): void {
		this.text = text;
	}

	/** 标记完成——下一次 render 会加上底边框 */
	finalize(): void {
		this.finalized = true;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const c = this.colorFn;
		const lines: string[] = [];

		// ╭── Label ──...──╮
		const labelPart = `── ${this.label} ──`;
		const labelWidth = visibleWidth(labelPart);
		const dashRight = Math.max(0, width - labelWidth - 2);
		lines.push(c(`╭${labelPart}${"─".repeat(dashRight)}╮`));

		// │ content │
		const contentWidth = Math.max(1, width - 4);
		const contentLines = this.text
			? wrapLines(this.text, contentWidth)
			: [""];

		for (const contentLine of contentLines) {
			const lineWidth = visibleWidth(contentLine);
			const pad = " ".repeat(Math.max(0, contentWidth - lineWidth));
			const body = `${contentLine}${pad}`;
			lines.push(`${c("│")} ${truncateToWidth(body, contentWidth)} ${c("│")}`);
		}

		// ╰──...──╯（仅 finalized）
		if (this.finalized) {
			lines.push(c(`╰${"─".repeat(width - 2)}╯`));
		}

		return lines;
	}
}

/** ANSI 前景色 */
const FG = {
	cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,
	green: (t: string) => `\x1b[32m${t}\x1b[0m`,
	gray: (t: string) => `\x1b[90m${t}\x1b[0m`,
	red: (t: string) => `\x1b[31m${t}\x1b[0m`,
	yellow: (t: string) => `\x1b[33m${t}\x1b[0m`,
	blue: (t: string) => `\x1b[34m${t}\x1b[0m`,
} as const;

export type AnsiColor = keyof typeof FG;

function wrapLines(text: string, maxWidth: number): string[] {
	const result: string[] = [];
	for (const paragraph of text.split("\n")) {
		if (visibleWidth(paragraph) <= maxWidth) {
			result.push(paragraph);
		} else {
			let remaining = paragraph;
			while (visibleWidth(remaining) > maxWidth) {
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