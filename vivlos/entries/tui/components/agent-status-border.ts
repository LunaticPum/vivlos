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

type Cache = { width: number; lines: string[] };

/**
 * Agent Turn 状态边框。
 *
 * 内容驱动：有 finalText 就画最终消息，否则 thinking 和 tool 各自按内容显示。
 * thinking 永远在上方，tool 追加在下面。
 */
export class AgentStatusBorder implements Component {
	private tui: TUI;
	private turn = 0;
	private thinkingContext = "";
	private tools: ToolEntry[] = [];
	private finalText = "";

	private timer?: ReturnType<typeof setInterval>;
	private spinnerFrame = 0;
	private cache?: Cache;

	constructor(tui: TUI) {
		this.tui = tui;
		this.startSpinner();
	}

	startTurn(turn: number): void {
		this.turn = turn;
		this.tools = [];
		this.thinkingContext = "";
		this.finalText = "";
		this.cache = undefined;
	}

	setThinking(text: string): void {
		this.thinkingContext = text;
		this.cache = undefined;
	}

	addTool(name: string): void {
		this.tools.push({ name, result: "", done: false });
		this.cache = undefined;
	}

	updateToolResult(text: string): void {
		if (this.tools.length === 0) return;
		this.tools[this.tools.length - 1]!.result = text;
		this.cache = undefined;
	}

	endTool(): void {
		if (this.tools.length === 0) return;
		this.tools[this.tools.length - 1]!.done = true;
		this.cache = undefined;
	}

	finalize(text: string): void {
		this.finalText = text;
		this.stopSpinner();
		this.cache = undefined;
	}

	dispose(): void {
		this.stopSpinner();
	}

	invalidate(): void {
		this.cache = undefined;
	}

	render(width: number): string[] {
		if (this.cache && this.cache.width === width) return this.cache.lines;

		const c = FG.cyan;
		const lines: string[] = [];
		const turnNum = TURN_NUMBERS[(this.turn - 1) % TURN_NUMBERS.length] ?? String(this.turn);
		const spin = BRAILLE[this.spinnerFrame % BRAILLE.length] ?? "?";

		const labelPart = "── vivlos ──";
		const dashRight = Math.max(0, width - visibleWidth(labelPart) - 2);
		lines.push(c(`╭${labelPart}${"─".repeat(dashRight)}╮`));

		if (this.finalText) {
			const cl = wrapLines(this.finalText, width - 4);
			for (const cline of cl) {
				lines.push(`  ${truncateToWidth(cline, width - 4)}`);
			}
		} else {
			// ── thinking（始终显示）──
			const header = FG.pink(`${turnNum} ${spin}  Thinking...`);
			lines.push(padLine(c("│"), ` ${header}`, width, c("│")));

			if (this.thinkingContext) {
				const ctxLines = wrapLines(this.thinkingContext, width - 11).slice(0, 3);
				for (let i = 0; i < ctxLines.length; i++) {
					if (i === 0) {
						lines.push(padLine(c("│"), `   ${FG.gray("╰─>")} ${truncateToWidth(ctxLines[i]!, width - 12)}`, width, c("│")));
					} else {
						lines.push(padLine(c("│"), `         ${truncateToWidth(ctxLines[i]!, width - 15)}`, width, c("│")));
					}
				}
			}

			// ── tool section（追加在 thinking 下方）──
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

		this.cache = { width, lines };
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