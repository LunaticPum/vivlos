import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

const BRAILLE = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
const MIN_SPIN_MS = 400;

type LogEntry =
	| { kind: "thinking"; text: string }
	| { kind: "tool"; name: string; result: string; done: boolean; startedAt: number };

const FG = {
	cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,
	gray: (t: string) => `\x1b[90m${t}\x1b[0m`,
	green: (t: string) => `\x1b[38;5;120m${t}\x1b[0m`,
	tool: (t: string) => `\x1b[38;5;183m${t}\x1b[0m`,
	done: (t: string) => `\x1b[32m${t}\x1b[0m`,
} as const;

type Cache = { width: number; collapsed: boolean; lines: string[] };

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

	startTurn(_turn: number): void { this.cache = undefined; }

	setThinking(text: string): void {
		const last = this.logs[this.logs.length - 1];
		if (last && last.kind === "thinking") { last.text = text; }
		else { this.logs.push({ kind: "thinking", text }); }
		this.cache = undefined;
	}

	addTool(name: string): void {
		this.logs.push({ kind: "tool", name, result: "", done: false, startedAt: Date.now() });
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
		const t = FG.tool;
		const d = FG.done;
		const spin = BRAILLE[this.spinnerFrame % BRAILLE.length] ?? "?";
		const lines: string[] = [];
		const innerW = width - 4;

		const header = "── vivlos ──";
		const dashR = Math.max(0, width - visibleWidth(header) - 2);
		lines.push(c(`╭${header}${"─".repeat(dashR)}╮`));

		const turnCount = this.logs.filter((e) => e.kind === "thinking").length;
		const toolCount = this.logs.filter((e) => e.kind === "tool").length;
		const hasLogs = this.logs.length > 0;
		const label = "── 推理过程 ──";

		if (this.finalText && this.collapsed && hasLogs) {
			const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
			const summary = `${turnCount} Turns  ${toolCount} Tools  耗时 ${elapsed}s`;
			drawInnerBox(lines, label, innerW, width, [h(` ${summary}`)], false);

			lines.push(makeLine(c("│"), "", width, c("│")));
			const cl = wrapLines(this.finalText, width - 4);
			for (const cline of cl) {
				lines.push(makeLine(c("│"), ` ${truncateToWidth(cline, width - 4)}`, width, c("│")));
			}
		} else if (hasLogs) {
			const body: string[] = [];
			const thinkList: { idx: number; entry: LogEntry & { kind: "thinking" } }[] = [];
			const toolList: { idx: number; entry: LogEntry & { kind: "tool" } }[] = [];

			for (let i = 0; i < this.logs.length; i++) {
				const e = this.logs[i]!;
				if (e.kind === "thinking") thinkList.push({ idx: i, entry: e });
				else toolList.push({ idx: i, entry: e });
			}

			for (const { idx, entry } of thinkList) {
				const isActive = !this.finalText && this.isActiveEntry(idx);
				const icon = isActive ? `${spin}` : "✓";
				body.push(` ${d(icon)} ${h("Thinking...")}`);
				const ctxLines = wrapLines(entry.text, innerW - 6).slice(0, 3);
				for (let j = 0; j < ctxLines.length; j++) {
					const prefix = j === 0 ? g("╰─> ") : "    ";
					body.push(` ${prefix}${g(truncateToWidth(ctxLines[j]!, innerW - 6))}`);
				}
			}

			if (thinkList.length > 0 && toolList.length > 0) {
				body.push(g(" ────────────────────────────"));
			}

			for (const { idx, entry } of toolList) {
				const isActive = !this.finalText && this.isActiveEntry(idx);
				const icon = isActive ? `${spin}` : "✓";
				body.push(` ${d(icon)} ${t(`Calling ${entry.name}`)}`);
				if (entry.result) {
					const resLines = wrapLines(entry.result, innerW - 6).slice(0, 2);
					for (let j = 0; j < resLines.length; j++) {
						const prefix = j === 0 ? g("╰─> ") : "    ";
						body.push(` ${prefix}${g(truncateToWidth(resLines[j]!, innerW - 6))}`);
					}
				}
			}

			drawInnerBox(lines, label, innerW, width, body, !this.collapsed);

			if (this.finalText) {
				lines.push(makeLine(c("│"), "", width, c("│")));
				const cl = wrapLines(this.finalText, width - 4);
				for (const cline of cl) {
					lines.push(makeLine(c("│"), ` ${truncateToWidth(cline, width - 4)}`, width, c("│")));
				}
			}
		} else if (this.finalText) {
			const cl = wrapLines(this.finalText, width - 4);
			for (const cline of cl) {
				lines.push(makeLine(c("│"), ` ${truncateToWidth(cline, width - 4)}`, width, c("│")));
			}
		}

		lines.push(c(`╰${"─".repeat(width - 2)}╯`));

		this.cache = { width, collapsed: this.collapsed, lines };
		return lines;
	}

	private isActiveEntry(i: number): boolean {
		if (this.finalText) return false;
		const last = this.logs[this.logs.length - 1];
		if (!last) return false;
		if (last.kind === "thinking") return i === this.logs.length - 1;
		if (last.kind === "tool") {
			if (!last.done) return i === this.logs.length - 1;
			if (Date.now() - last.startedAt < MIN_SPIN_MS) return i === this.logs.length - 1;
		}
		return false;
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

/**
 * drawInnerBox: 画 ┌── label ──┐ ... └──────┘
 * 
 * 关键：body 行的左右 border │ 不套 ANSI 转义——
 * 避免 ANSI 嵌套导致 visibleWidth 计算错位、边框断裂。
 * border 字符用纯文本，body 内容的 ANSI 不影响宽度计算。
 */
function drawInnerBox(
	lines: string[], label: string, innerW: number, fullW: number,
	body: string[], expanded: boolean,
): void {
	const padInner = Math.max(0, innerW - 2);
	const capLab = Math.max(0, padInner - visibleWidth(label));
	// top line: │ ┌── label ──┐ │
	// 左 │ 用 cyan ANSI，内框 ┌──label──┐ 不套 ANSI
	const innerTop = `┌${label}${"─".repeat(capLab)}┐`;
	lines.push(makeLine(FG.cyan("│"), ` ${innerTop}`, fullW, FG.cyan("│")));

	for (const bline of body) {
		// body 行: │ │ content padding │ │
		// 内框左右 │ 不套 ANSI，纯文本
		const contentW = visibleWidth(bline);
		const padding = Math.max(0, innerW - 2 - contentW);
		const row = `│${bline}${" ".repeat(padding)}│`;
		lines.push(makeLine(FG.cyan("│"), ` ${row}`, fullW, FG.cyan("│")));
	}

	// bottom line: │ └──────┘ │
	const innerBot = `└${"─".repeat(padInner)}┘`;
	lines.push(makeLine(FG.cyan("│"), ` ${innerBot}`, fullW, FG.cyan("│")));
}

function makeLine(border: string, content: string, width: number, right: string): string {
	const cw = visibleWidth(content);
	const p = Math.max(0, width - cw - visibleWidth(right) - 1);
	return `${border}${content}${" ".repeat(p)}${right}`;
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
