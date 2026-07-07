import type { Component, TUI } from "@earendil-works/pi-tui";

/**
 * 粉色渐变随机浮现 spinner。
 *
 * braille 字符从 ⠋-⠏ 随机跳跃（非顺序轮播），
 * 颜色在粉色系 256 色中渐变。
 */
export class PinkSpinner implements Component {
	private tui: TUI;
	private label: string;
	private running = false;
	private timer?: ReturnType<typeof setInterval>;

	/** 当前 braille 字符索引 */
	private frame = 0;
	/** 当前颜色索引 */
	private colorIdx = 0;

	/** braille 字符池 */
	private static readonly BRAILLE = [
		"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
	];

	/** 粉色渐变调色板——216 色表里从浅粉到深粉 */
	private static readonly PINK_GRADIENT = [
		218, 211, 204, 205, 206, 207, 213, 219, 225, 218,
	];

	constructor(tui: TUI, label = "Thinking...") {
		this.tui = tui;
		this.label = label;
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.tick();
		this.timer = setInterval(() => this.tick(), 100);
	}

	stop(): void {
		this.running = false;
		if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
	}

	setLabel(label: string): void {
		this.label = label;
	}

	invalidate(): void {}

	render(_width: number): string[] {
		const char = PinkSpinner.BRAILLE[this.frame];
		const color = PinkSpinner.PINK_GRADIENT[this.colorIdx];
		return [`\x1b[38;5;${color}m${char}\x1b[0m ${this.label}`];
	}

	private tick(): void {
		// 随机跳跃到不同的 braille 字符——模拟"浮现"效果
		const next = Math.floor(Math.random() * PinkSpinner.BRAILLE.length);
		this.frame = next === this.frame
			? (next + 1) % PinkSpinner.BRAILLE.length
			: next;

		// 颜色渐变循环
		this.colorIdx = (this.colorIdx + 1) % PinkSpinner.PINK_GRADIENT.length;

		this.tui.requestRender();
	}
}