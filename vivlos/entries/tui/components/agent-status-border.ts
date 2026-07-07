import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

const BRAILLE = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];

// ── 日志条目 ──
type LogEntry =
	| { kind: "thinking"; text: string }
	| { kind: "tool"; name: string; result: string; done: boolean };

// ── 颜色 ──
const FG = {
	cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,       // 外框
	gray: (t: string) => `\x1b[90m${t}\x1b[0m`,       // 内框 + 普通文本
	green: (t: string) => `\x1b[92m${t}\x1b[0m`,      // Thinking... / Calling
	done: (t: string) => `\x1b[32m${t}\x1b[0m`,       // ✓
} as const;

type Cache = { width: number; collapsed: boolean; lines: string[] };

/**
 * Agent Turn 状态边框。
 *
 * 外框 ╭╮╰╯ + 内框 ┌─┐└─┘（推理过程）。
 * thinking/tool 日志追加式存储，render 时遍历渲染。
 */
export class AgentStatusBorder implements Component {
	private tui: TUI;
	private logs: LogEntry[] = [];
	private finalText = "";
	private collapsed = false;
	private startTime = 0;

	private timer?: ReturnType<typeof setInterval>;
	private spinnerFrame = 0;
	private cache?: Cache;

	constructor(tui: TUI) {
		this.tui = tui;
		this.startTime = Date.now();
		this.startSpinner();
	}

	startTurn(_turn: number): void {
		// 不主动 push thinking——thinking 由 setThinking() 追加
		this.cache = undefined;
	}

	setThinking(text: string): void {
		if (this.finalText) return;
		const last = this.logs[this.logs.length - 1];
		if (last && last.kind === "thinking") {
			// 同一段 thinking 内更新文本
			last.text = text;
		} else {
			this.logs.push({ kind: "thinking", text });
		}
		this.cache = undefined;
	}

	addTool(name: string): void {
		if (this.finalText) return;
		this.logs.push({ kind: "tool", name, result: "", done: false });
		this.cache = undefined;
	}

	updateToolResult(text: string): void {
		const last = this.logs[this.logs.length - 1];
		if (last?.kind === "tool") { last.result = text; this.cache = undefined; }
	}

	endTool(): void {
		const last = this.logs[this.logs.length - 1];
		if (last?.kind === "tool") { last.done = true; this.cache = undefined; }
	}

	finalize(text: string): void {
		this.finalText = text;
		this.stopSpinner();
		this.cache = undefined;
	}

	toggle(): void {
		this.collapsed = !this.collapsed;
		this.cache = undefined;
		this.tui.requestRender();
	}

	dispose(): void { this.stopSpinner(); }
	invalidate(): void { this.cache = undefined; }

	render(width: number): string[] {
		if (this.cache && this.cache.width === width && this.cache.collapsed === this.collapsed)
			return this.cache.lines;

		const c = FG.cyan;
		const g = FG.gray;
		const h = FG.green;
		const d = FG.done;
		const spin = BRAILLE[this.spinnerFrame % BRAILLE.length] ?? "?";
		const lines: string[] = [];

		// ╭── vivlos ──╮
		const header = "── vivlos ──";
		const dashR = Math.max(0, width - visibleWidth(header) - 2);
		lines.push(c(`╭${header}${"─".repeat(dashR)}╮`));

		const turnCount = this.logs.filter((e) => e.kind === "thinking").length;
		const toolCount = this.logs.filter((e) => e.kind === "tool").length;
		const hasLogs = this.logs.length > 0;

		// ──── 内框（推理过程）────
		const innerW = width - 4; // 左右各缩进 1 个 │ + 1 空格

		if (this.finalText && this.collapsed && hasLogs) {
			// 折叠摘要行
			const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
			const summary = `${turnCount} Turns  ${toolCount} Tools  耗时 ${elapsed}s`;
			drawInnerBox(lines, c, g, innerW, width, [g(` ${summary}`)]);
		} else if (hasLogs) {
			const body: string[] = [];
			let lastKind: string | null = null;

			for (let i = 0; i < this.logs.length; i++) {
				const entry = this.logs[i]!;
				const isActive = this.isActiveEntry(i);

				if (entry.kind === "thinking") {
					if (lastKind === "tool") body.push(g(" ────────────────────────────"));
					const icon = isActive ? `${spin}` : "✓";
					body.push(` ${d(icon)} ${h("Thinking...")}`);
					const ctxLines = wrapLines(entry.text, innerW - 6).slice(0, 3);
					for (let j = 0; j < ctxLines.length; j++) {
						const prefix = j === 0 ? g("╰─> ") : "    ";
						body.push(` ${prefix}${g(truncateToWidth(ctxLines[j]!, innerW - 6))}`);
					}
				} else {
					if (lastKind === "thinking") body.push(g(" ────────────────────────────"));
					const icon = isActive ? `${spin}` : "✓";
					body.push(` ${d(icon)} ${isActive ? h(`Calling ${entry.name}`) : h(entry.name)}`);
					if (entry.result) {
						const resLines = wrapLines(entry.result, innerW - 6).slice(0, 2);
						for (let j = 0; j < resLines.length; j++) {
							const prefix = j === 0 ? g("╰─> ") : "    ";
							body.push(` ${prefix}${g(truncateToWidth(resLines[j]!, innerW - 6))}`);
						}
					}
				}
				lastKind = entry.kind;
			}
			drawInnerBox(lines, c, g, innerW, width, body);
		}

		// ──── final 文本 ────
		if (this.finalText) {
			if (hasLogs) lines.push(c(`│ ${" ".repeat(width - 4)} ${c("│")}`)); // 空行分隔
			const cl = wrapLines(this.finalText, width - 4);
			for (const cline of cl) {
				lines.push(`  ${truncateToWidth(cline, width - 4)}`);
			}
		}

		// ╰──...──╯
		lines.push(c(`╰${"─".repeat(width - 2)}╯`));

		this.cache = { width, collapsed: this.collapsed, lines };
		return lines;
	}

	/** 判断 logs[i] 是否为当前 active 条目（显示 spin） */
	private isActiveEntry(i: number): boolean {
		if (this.finalText) return false;
		// 最后一个未完成的条目是 active
		const last = this.logs[this.logs.length - 1];
		if (!last) return false;
		if (last.kind === "tool" && !last.done) return i === this.logs.length - 1;
		return last.kind === "thinking" && i === this.logs.length - 1;
	}

	private startSpinner(): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			this.spinnerFrame++;
			this.cache = undefined;
			this.tui.requestRender();
		}, 100);
	}

	private stopSpinner(): void {
		if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
	}
}

/** 画内框 ┌─...─┐ / │body│ / └─...─┘ */
function drawInnerBox(
	lines: string[],
	c: (s: string) => string,
	g: (s: string) => string,
	innerW: number,
	fullW: number,
	body: string[],
): void {
	const padInner = Math.max(0, innerW - 2);
	lines.push(pad(c("│"), ` ${g(`┌${"─".repeat(padInner)}┐`)}`, fullW, c("│")));
	for (const bline of body) {
		lines.push(pad(c("│"), ` ${g("│")}${bline}${" ".repeat(Math.max(0, innerW - 2 - visibleWidth(bline)))}${g("│")}`, fullW, c("│")));
	}
	lines.push(pad(c("│"), ` ${g(`└${"─".repeat(padInner)}┘`)}`, fullW, c("│")));
}

function pad(border: string, content: string, width: number, right: string): string {
	const cw = visibleWidth(content);
	const pad = Math.max(0, width - cw - visibleWidth(right) - 1);
	return `${border}${content}${" ".repeat(pad)}${right}`;
}

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