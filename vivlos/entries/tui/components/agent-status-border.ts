import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth, Markdown, type MarkdownTheme, type DefaultTextStyle } from "@earendil-works/pi-tui";

const BRAILLE = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
const MIN_SPIN_MS = 400;

type LogEntry =
	| { kind: "thinking"; text: string }
	| { kind: "tool"; name: string; callId: string; result: string; done: boolean; startedAt: number }
	| { kind: "turn_sep" };

const FG = {
	cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,
	gray: (t: string) => `\x1b[90m${t}\x1b[0m`,
	green: (t: string) => `\x1b[38;5;120m${t}\x1b[0m`,
	tool: (t: string) => `\x1b[38;5;183m${t}\x1b[0m`,
	done: (t: string) => `\x1b[32m${t}\x1b[0m`,
	bold: (t: string) => `\x1b[1m${t}\x1b[22m`,
	italic: (t: string) => `\x1b[3m${t}\x1b[23m`,
	underline: (t: string) => `\x1b[4m${t}\x1b[24m`,
	strikethrough: (t: string) => `\x1b[9m${t}\x1b[29m`,
} as const;

const MARKDOWN_DEFAULT_TEXT: DefaultTextStyle = {
	color: (t) => t, // 保持默认终端颜色
};

const MARKDOWN_THEME: MarkdownTheme = {
	heading: (t) => FG.bold(FG.cyan(t)),
	link: (t) => FG.underline(FG.cyan(t)),
	linkUrl: (t) => FG.gray(t),
	code: (t) => FG.cyan(t),
	codeBlock: (t) => FG.green(t),
	codeBlockBorder: (t) => FG.gray(t),
	quote: (t) => FG.gray(t),
	quoteBorder: (t) => FG.gray(t),
	hr: (_t) => FG.gray("─".repeat(40)),
	listBullet: (t) => FG.cyan(t),
	bold: (t) => FG.bold(t),
	italic: (t) => FG.italic(t),
	strikethrough: (t) => FG.strikethrough(t),
	underline: (t) => FG.underline(t),
	highlightCode: (code) => code.split("\n").map((line) => FG.green(line)),
	codeBlockIndent: "",
};

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

type Cache = { width: number; collapsed: boolean; lines: string[] };

/** 删除 markdown 渲染行首的 `### ` 前缀（h3+ 标题在 pi-tui 中会保留 # 前缀） */
function stripHeadingPrefix(line: string): string {
	const plain = line.replace(ANSI_RE, "");
	if (!/^#{1,6}\s/.test(plain)) return line;
	const m = line.match(/^((?:\x1b\[[0-9;]*[a-zA-Z])*)\s*#{1,6}\s((?:\x1b\[[0-9;]*[a-zA-Z])*)/);
	if (!m) return line;
	return m[1] + m[2] + line.slice(m[0].length);
}

export class AgentStatusBorder implements Component {
	private tui: TUI;
	private logs: LogEntry[] = [];
	private activeThinkingIdx = -1;
	private callIdMap = new Map<string, number>();
	private finalText = "";
	private collapsed = false;
	private startTime = 0;

	private timer?: ReturnType<typeof setInterval>;
	private spinnerFrame = 0;
	private cache?: Cache;
	private mdComponent: Markdown | null = null;
	/** thinking 文本 → Markdown 组件缓存，仅 text 变化时重建 */
	private thinkingMdCache: { text: string; md: Markdown } | null = null;

	constructor(tui: TUI) {
		this.tui = tui;
		this.startTime = Date.now();
		this.startSpinner();
	}

	startTurn(_turn: number): void {
		this.cache = undefined;
		this.activeThinkingIdx = -1;
	}

	setThinking(text: string): void {
		if (this.activeThinkingIdx >= 0 && this.activeThinkingIdx < this.logs.length) {
			const entry = this.logs[this.activeThinkingIdx];
			if (entry?.kind === "thinking") {
				entry.text = text;
				this.cache = undefined;
				return;
			}
		}
		this.logs.push({ kind: "thinking", text });
		this.activeThinkingIdx = this.logs.length - 1;
		this.cache = undefined;
	}

	addTool(name: string, callId: string): void {
		this.activeThinkingIdx = -1;
		const idx = this.logs.length;
		this.logs.push({ kind: "tool", name, callId, result: "", done: false, startedAt: Date.now() });
		this.callIdMap.set(callId, idx);
		this.cache = undefined;
	}

	updateToolResult(callId: string, text: string): void {
		const idx = this.callIdMap.get(callId);
		if (idx !== undefined) {
			const entry = this.logs[idx];
			if (entry?.kind === "tool") { entry.result = text; this.cache = undefined; }
		}
	}

	endTool(callId: string): void {
		const idx = this.callIdMap.get(callId);
		if (idx !== undefined) {
			const entry = this.logs[idx];
			if (entry?.kind === "tool") { entry.done = true; this.cache = undefined; }
		}
	}

	turnComplete(): void {
		this.activeThinkingIdx = -1;
		this.logs.push({ kind: "turn_sep" });
		this.cache = undefined;
	}

	finalize(text: string): void {
		this.finalText = text;
		this.activeThinkingIdx = -1;
		this.stopSpinner();
		// 移除最后一条 turn_sep（末尾不需要分割线）
		const last = this.logs[this.logs.length - 1];
		if (last?.kind === "turn_sep") {
			this.logs.pop();
		}
		this.mdComponent = new Markdown(text, 0, 0, MARKDOWN_THEME, MARKDOWN_DEFAULT_TEXT);
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

		const hasLogs = this.logs.length > 0;
		const label = "── 推理过程 ──";

		const renderFinalText = (contentW: number) => {
			if (!this.mdComponent) {
				const cl = wrapLines(this.finalText, contentW);
				for (const cline of cl) {
					const content = ` ${cline}`;
					const cw = visibleWidth(content);
					const padding = Math.max(0, width - cw - 2);
					lines.push(`${c("│")}${content}${" ".repeat(padding)}${c("│")}`);
				}
				return;
			}
			// Markdown 组件已按宽度渲染，不再 truncateToWidth（避免破坏 emoji 和 ANSI）
			const mdLines = this.mdComponent.render(Math.max(1, contentW));
			for (const raw of mdLines) {
				const ml = stripHeadingPrefix(raw);
				const content = ` ${ml}`;
				const cw = visibleWidth(content);
				const padding = Math.max(0, width - cw - 2);
				lines.push(`${c("│")}${content}${" ".repeat(padding)}${c("│")}`);
			}
		};

		if (this.finalText && this.collapsed && hasLogs) {
			const turnCount = this.logs.filter((e) => e.kind === "turn_sep").length + 1;
			const toolCount = this.logs.filter((e) => e.kind === "tool").length;
			const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
			const summary = `${turnCount} Turns  ${toolCount} Tools  耗时 ${elapsed}s`;
			drawInnerBox(lines, label, innerW, width, [h(` ${summary}`)], false);
			lines.push(makeLine(c("│"), "", width, c("│")));
			renderFinalText(width - 4);
		} else if (hasLogs) {
			const body: string[] = [];
			// inner box 内真正可用宽度（减去 │ 边框）
			const innerContentW = innerW - 2;

			for (let i = 0; i < this.logs.length; i++) {
				const e = this.logs[i]!;

				if (e.kind === "turn_sep") {
					body.push(c(` ${"─".repeat(innerW - 4)}`));
					continue;
				}

				if (e.kind === "thinking") {
					const isActive = !this.finalText && i === this.activeThinkingIdx;
					const icon = isActive ? `${spin}` : "✓";
					body.push(` ${d(icon)} ${h("Thinking...")}`);
					if (e.text) {
						// 可用宽度: innerW - 2(inner│) - 5(prefix " ╰─> ") = innerW - 7
						const maxTextW = Math.max(1, innerW - 7);
						const md = this.getThinkingMd(e.text);
						const mdLines = md.render(maxTextW).slice(0, 3);
						for (let j = 0; j < mdLines.length; j++) {
							const prefix = g(j === 0 ? "╰─> " : "  ┆ ");
							body.push(` ${prefix}${mdLines[j]!}`);
						}
					}
				} else {
					const isActive = !this.finalText && i === this.logs.length - 1 && !e.done;
					const icon = isActive ? `${spin}` : "✓";
					body.push(` ${d(icon)} ${t(`Calling ${e.name}`)}`);
					if (e.result) {
						const maxTextW = Math.max(1, innerW - 7);
						const resLines = wrapLines(e.result, maxTextW).slice(0, 3);
						for (let j = 0; j < resLines.length; j++) {
							const prefix = g(j === 0 ? "╰─> " : "  ┆ ");
							body.push(` ${prefix}${g(resLines[j]!)}`);
						}
					}
				}
			}

			drawInnerBox(lines, label, innerW, width, body, !this.collapsed);

			if (this.finalText) {
				lines.push(makeLine(c("│"), "", width, c("│")));
				renderFinalText(width - 4);
			}
		} else if (this.finalText) {
			renderFinalText(width - 4);
		}

		lines.push(c(`╰${"─".repeat(width - 2)}╯`));

		this.cache = { width, collapsed: this.collapsed, lines };
		return lines;
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

	/** 获取 thinking 文本对应的 Markdown 组件（缓存复用） */
	private getThinkingMd(text: string): Markdown {
		if (this.thinkingMdCache && this.thinkingMdCache.text === text) {
			return this.thinkingMdCache.md;
		}
		const md = new Markdown(text, 0, 0, MARKDOWN_THEME, MARKDOWN_DEFAULT_TEXT);
		this.thinkingMdCache = { text, md };
		return md;
	}
}

function drawInnerBox(
	lines: string[], label: string, innerW: number, fullW: number,
	body: string[], _expanded: boolean,
): void {
	const padInner = Math.max(0, innerW - 2);
	const labelW = visibleWidth(label);
	const capLab = Math.max(0, padInner - labelW);
	const innerTop = `┌${label}${"─".repeat(capLab)}┐`;
	lines.push(makeLine(FG.cyan("│"), ` ${innerTop}`, fullW, FG.cyan("│")));

	for (const bline of body) {
		const contentW = visibleWidth(bline);
		const padding = Math.max(0, innerW - 2 - contentW);
		const row = `│${bline}${" ".repeat(padding)}│`;
		lines.push(makeLine(FG.cyan("│"), ` ${row}`, fullW, FG.cyan("│")));
	}
	const innerBot = `└${"─".repeat(Math.max(0, padInner))}┘`;
	lines.push(makeLine(FG.cyan("│"), ` ${innerBot}`, fullW, FG.cyan("│")));
}

function makeLine(border: string, content: string, width: number, right: string): string {
	const cw = visibleWidth(content);
	const p = Math.max(0, width - cw - visibleWidth(right) - 1);
	return `${border}${content}${" ".repeat(p)}${right}`;
}

function wrapLines(text: string, maxWidth: number): string[] {
	const result: string[] = [];
	if (!text) return result;
	for (const paragraph of text.split("\n")) {
		if (visibleWidth(paragraph) <= maxWidth) {
			result.push(paragraph);
		} else {
			let remaining = paragraph;
			while (visibleWidth(remaining) > maxWidth) {
				const clipped = truncateToWidth(remaining, maxWidth);
				result.push(clipped);
				remaining = remaining.slice(clipped.length).trimStart();
			}
			if (remaining.length > 0) result.push(remaining);
		}
	}
	return result;
}
