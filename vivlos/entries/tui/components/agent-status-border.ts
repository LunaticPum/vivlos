import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

const BRAILLE = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
const TURN_NUMBERS = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];
const TOOL_MIN_DISPLAY_MS = 600; // tool 最少展示时长

type Phase = "thinking" | "tool" | "final";

interface ToolEntry {
	name: string;
	result: string;
	done: boolean;
	doneAt: number; // Date.now() when completed
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
 * thinking 和 tool 互斥展示，tool 最少展示 600ms 防闪烁。
 */
export class AgentStatusBorder implements Component {
	private tui: TUI;
	private turn = 0;
	private phase: Phase = "thinking";
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
		this.phase = "thinking";
		this.cache = undefined;
	}

	setThinking(text: string): void {
		this.phase = "thinking";
		this.thinkingContext = text;
		this.cache = undefined;
	}

	addTool(name: string): void {
		this.phase = "tool";
		this.tools.push({ name, result: "", done: false, doneAt: 0 });
		this.cache = undefined;
	}

	updateToolResult(text: string): void {
		if (this.tools.length === 0) return;
		this.tools[this.tools.length - 1]!.result = text;
		this.cache = undefined;
	}

	endTool(): void {
		if (this.tools.length === 0) return;
		const tool = this.tools[this.tools.length - 1]!;
		tool.done = true;
		tool.doneAt = Date.now();
		this.cache = undefined;
	}

	finalize(text: string): void {
		this.finalText = text;
		this.phase = "final";
		this.stopSpinner();
		this.cache = undefined;
	}

	dispose(): void {
		this.stopSpinner();
	}

	invalidate(): void {
		this.cache = undefined;
	}

	// ── render ──

	render(width: number): string[] {
		// tool 过期检查——如果 tool 已完成超过 TOOL_MIN_DISPLAY_MS，回到 thinking
		if (this.phase === "tool" && this.tools.length > 0) {
			const last = this.tools[this.tools.length - 1]!;
			if (last.done && Date.now() - last.doneAt > TOOL_MIN_DISPLAY_MS) {
				this.phase = "thinking";
				this.cache = undefined;
			}
		}

		if (this.cache && this.cache.width === width) return this.cache.lines;

		const c = FG.cyan;
		const lines: string[] = [];
		const turnNum = TURN_NUMBERS[(this.turn - 1) % TURN_NUMBERS.length] ?? String(this.turn);
		const spin = BRAILLE[this.spinnerFrame % BRAILLE.length] ?? "?";

		const labelPart = "── vivlos ──";
		const dashRight = Math.max(0, width - visibleWidth(labelPart) - 2);
		lines.push(c(`╭${labelPart}${"─".repeat(dashRight)}╮`));

		if (this.phase === "final") {
			if (this.finalText) {
				const cl = wrapLines(this.finalText, width - 4);
				for (const cline of cl) {
					lines.push(`  ${truncateToWidth(cline, width - 4)}`);
				}
			}
		} else if (this.phase === "tool") {
			const tool = this.tools[this.tools.length - 1];
			if (tool) {
				const header = tool.done
					? FG.green(`${turnNum}  ✓  ${tool.name}`)
					: FG.yellow(`${turnNum} ${spin}  Calling ${tool.name}`);
				lines.push(`${c("│")} ${header}${" ".repeat(Math.max(0, width - visibleWidth(header) - 4))} ${c("│")}`);

				if (tool.result) {
					const resLines = wrapLines(tool.result, width - 8).slice(0, 2);
					for (let i = 0; i < resLines.length; i++) {
						const prefix = i === 0
							? (tool.done ? FG.gray("╰─> ") : FG.yellow("╰─> "))
							: "    ";
						lines.push(`${c("│")}   ${prefix}${truncateToWidth(resLines[i]!, width - 11)} ${c("│")}`);
					}
				}
			}
		} else {
			const header = FG.pink(`${turnNum} ${spin}  Thinking...`);
			lines.push(`${c("│")} ${header}${" ".repeat(Math.max(0, width - visibleWidth(header) - 4))} ${c("│")}`);

			const ctxLines = wrapLines(this.thinkingContext, width - 8).slice(0, 3);
			for (let i = 0; i < ctxLines.length; i++) {
				const prefix = i === 0 ? FG.gray("╰─> ") : "    ";
				lines.push(`${c("│")}   ${prefix}${truncateToWidth(ctxLines[i]!, width - 11)} ${c("│")}`);
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