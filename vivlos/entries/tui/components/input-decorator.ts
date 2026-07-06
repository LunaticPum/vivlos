import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";

const FG = {
	cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,
} as const;

type Cache = { width: number; line: string };

/**
 * Hermes 风格输入框装饰行。
 *
 * ╭── model: deepseek-v4-flash ──╮   ← top 实例
 * > (input field)                   ← pi Input 组件
 * ╰───────────────────────────────╯  ← bottom 实例
 */
export class InputDecorator implements Component {
	private label: string;
	private variant: "top" | "bottom";
	private cache?: Cache;

	/**
	 * @param variant "top" = 带模型标签的上边框
	 *                "bottom" = 纯底边框
	 */
	constructor(variant: "top" | "bottom", modelLabel = "") {
		this.variant = variant;
		this.label = modelLabel;
	}

	setModelLabel(label: string): void {
		this.label = label;
		this.cache = undefined;
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		if (this.cache && this.cache.width === width) return [this.cache.line];

		const c = FG.cyan;
		let line: string;

		if (this.variant === "top") {
			const labelPart = this.label
				? `── model: ${this.label} ──`
				: "─────────────────────";
			const labelLen = visibleWidth(labelPart);
			const dashRight = Math.max(0, width - labelLen - 2);
			line = c(`─${labelPart}${"─".repeat(dashRight)}─`);
		} else {
			line = c(`─${"─".repeat(width - 2)}─`);
		}

		this.cache = { width, line };
		return [line];
	}
}
