import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

const BRAILLE = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
const TURN_NUMBERS = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];

interface ToolEntry {
	name: string;
	result: string;
	done: boolean;
}

const FG = {
	cyan: (t: string) => `\x1b[36m${t}\x1b[0m`,
	pink: (t: string) => `\x1b[38;5;218m${t}\x1b[0m`,
	yellow: (t: string) => `\x1b[38;5;220m${t}\x1b[0m`,
	gray: (t: string) => `\x1b[90m${t}\x1b[0m`,
	green: (t: string) => `\x1b[32m${t}\x1b[0m`,
} as const;

type Cache = { width: number; collapsed: boolean; lines: string[] };

/**
 * Agent Turn 状态边框。
 *
 * finalMessage 到达后自动折叠 thinking/tool 为灰色摘要行。
 * toggle() 展开/收起，后续接键盘 Ctrl+O。
 */
export class AgentStatusBorder implements Component {
	private tui: TUI;
	private turn = 0;
	private turnCount = 0;
	private thinkingContext = "";
	private tools: ToolEntry[] = [];
	private finalText = "";
	private collapsed = false;

	private timer?: ReturnType<typeof setInterval>;
	private spinnerFrame = 0;
	private cache?: Cache;

	constructor(tui: TUI) {
		this.tui = tui;
		this.startSpinner();
	}

	startTurn(turn: number): void {
		this.turn = turn;
		this.turnCount++;
		this.thinkingContext = "";
		this.cache = undefined;
	}

	setThinking(text: string): void {
		if (this.finalText) return;
		this.thinkingContext = text;
		this.cache = undefined;
	}

	addTool(name: string): void {
		if (this.finalText) return;
		this.tools.push({ name, result: "", done: false });
		this.cache = undefined;
	}

	updateToolResult(text: string): void {
		if (this.tools.length === 0 || this.finalText) return;
		this.tools[this.tools.length - 1]!.result = text;
		this.cache = undefined;
	}

	endTool(): void {
		if (this.tools.length === 0 || this.finalText) return;
		this.tools[this.tools.length - 1]!.done = true;
		this.cache = undefined;
	}

	finalize(text: string): void {
		this.finalText = text;
		this.collapsed = true; // 默认折叠
		this.stopSpinner();
		this.cache = undefined;
	}

	/** 切换折叠/展开 */
	toggle(): void {
		this.collapsed = !this.collapsed;
		this.cache = undefined;
		this.tui.requestRender();
	}

	dispose(): void {
		this.stopSpinner();
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		if (this.cache && this.cache.width === width && this.cache.collapsed === this.collapsed) {
			return this.cache.lines;
		}

		const c = FG.cyan;
		const lines: string[] = [];
		const turnNum = TURN_NUMBERS[(this.turn - 1) % TURN_NUMBERS.length] ?? String(this.turn);
		const spin = BRAILLE[this.spinnerFrame % BRAILLE.length] ?? "?";

		const labelPart = "── vivlos ──";
		const dashRight = Math.max(0, width - visibleWidth(labelPart) - 2);
		lines.push(c(`╭${labelPart}${"─".repeat(dashRight)}╮`));

		// —— 折叠摘要行 ——
		if (this.finalText && this.collapsed) {
			const toolCount = this.tools.length;
			const summary = toolCount > 0
				? `推理细节 ... ${this.turnCount} turns, ${toolCount} tools ── Ctrl+O 展开`
				: `推理细节 ... ${this.turnCount} turns ── Ctrl+O 展开`;
			lines.push(padLine(c("│"), ` ${FG.gray(summary)}`, width, c("│")));
			lines.push(padLine(c("│"), "", width, c("│"))); // 空行分隔
		}

		// —— 最终消息 ——
		if (this.finalText) {
			const cl = wrapLines(this.finalText, width - 4);
			for (const cline of cl) {
				lines.push(`  ${truncateToWidth(cline, width - 4)}`);
			}
		}

		// —— thinking/tool 日志（折叠时跳过）——
		if (!this.finalText || (this.finalText && !this.collapsed)) {
			if (!this.finalText) {
				// thinking header（有 finalText 时不画 spinner）
				const header = FG.pink(`${turnNum} ${spin}  Thinking...`);
				lines.push(padLine(c("│"), ` ${header}`, width, c("│")));
			} else {
				// 展开态：折叠行已画在顶部，这里画 frozen 的摘要标题
				lines.push(padLine(c("│"), ` ${FG.gray(`${turnNum}  ·  Thinking`)}`, width, c("│")));
			}

			if (this.thinkingContext && !this.finalText) {
				const ctxLines = wrapLines(this.thinkingContext, width - 11).slice(0, 3);
				for (let i = 0; i < ctxLines.length; i++) {
					if (i === 0) {
						lines.push(padLine(c("│"), `   ${FG.gray("╰─>")} ${truncateToWidth(ctxLines[i]!, width - 12)}`, width, c("│")));
					} else {
						lines.push(padLine(c("│"), `         ${truncateToWidth(ctxLines[i]!, width - 15)}`, width, c("│")));
					}
				}
			}

			if (this.tools.length > 0) {
				lines.push(padLine(c("│"), `   ${c("────")}`, width, c("│")));

				for (const tool of this.tools) {
					const toolHeader = tool.done
						? FG.green(`${turnNum}  ✓  ${tool.name}`)
						: FG.yellow(`${turnNum} ${spin}  Calling ${tool.name}`);
					lines.push(padLine(c("│"), ` ${toolHeader}`, width, c("│")));

					if (tool.result) {
						const resLines = wrapLines(tool.result, width - 11).slice(0, 2);
						for (let i = 0; i < resLines.length; i++) {
							if (i === 0) {
								const prefix = tool.done ? FG.gray("╰─>") : FG.yellow("╰─>");
								lines.push(padLine(c("│"), `   ${prefix} ${truncateToWidth(resLines[i]!, width - 12)}`, width, c("│")));
							} else {
								lines.push(padLine(c("│"), `         ${truncateToWidth(resLines[i]!, width - 15)}`, width, c("│")));
							}
						}
					}
				}
			}
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
}

function padLine(border: string, content: string, width: number, rightBorder: string): string {
	const contentWidth = visibleWidth(content);
	const pad = Math.max(0, width - contentWidth - visibleWidth(rightBorder) - 1);
	return `${border}${content}${" ".repeat(pad)}${rightBorder}`;
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