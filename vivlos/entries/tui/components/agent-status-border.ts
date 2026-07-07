import type { Component, TUI } from "@earendil-works/pi-tui";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

// ── 常量 ──

const BRAILLE = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
const TURN_NUMBERS = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"];

type Phase = "thinking" | "tool" | "final";

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
    blue: (t: string) => `\x1b[34m${t}\x1b[0m`,
} as const;

type Cache = { width: number; lines: string[] };

/**
 * Agent Turn 状态边框。
 *
 * 在 vivlos 的 BorderedMessage 框架内渲染：
 *  - turn 序号 ①②③（粉色/黄色区分 thinking/tool）
 *  - braille spinner（顺序轮播）
 *  - thinking context（最长 3 行，截断）
 *  - tool 条目（最长 2 行，同 turn 追加在下方）
 *  - 新 turn 时刷新顶部，旧 content 消失
 *  - final 时清空所有内容，只显示最终消息
 */
export class AgentStatusBorder implements Component {
    private tui: TUI;
    private turn = 0;
    private phase: Phase = "thinking";
    private thinkingContext = "";
    private tools: ToolEntry[] = [];
    private finalText = "";

    // spinner
    private timer?: ReturnType<typeof setInterval>;
    private spinnerFrame = 0;

    // cache
    private cache?: Cache;

    constructor(tui: TUI) {
        this.tui = tui;
        this.startSpinner();
    }

    // ── 公开 API ──

    /** 开始新 turn——清空 thinking context + 所有 tool 条目 */
    startTurn(turn: number): void {
        this.turn = turn;
        this.tools = [];
        this.thinkingContext = "";
        this.finalText = "";
        this.phase = "thinking";
        this.cache = undefined;
    }

    /** 设置 thinking 阶段的上下文文本（最长 3 行截断） */
    setThinking(text: string): void {
        this.phase = "thinking";
        this.thinkingContext = text;
        this.cache = undefined;
    }

    /** 追加一个 tool call 条目 */
    addTool(name: string): void {
        this.phase = "tool";
        this.tools.push({ name, result: "", done: false });
        this.cache = undefined;
    }

    /** 更新最后一个 tool 的 partial result */
    updateToolResult(text: string): void {
        if (this.tools.length === 0) return;
        this.tools[this.tools.length - 1]!.result = text;
        this.cache = undefined;
    }

    /** 结束最后一个 tool */
    endTool(): void {
        if (this.tools.length === 0) return;
        this.tools[this.tools.length - 1]!.done = true;
        this.cache = undefined;
    }

    /** 设置最终消息（agent done 时） */
    finalize(text: string): void {
        if (text.trim()) {
            this.finalText = text;
        }
        this.phase = "final";
        this.cache = undefined;
        this.stopSpinner();
    }

    dispose(): void {
        this.stopSpinner();
    }

    invalidate(): void {
        this.cache = undefined;
    }

    // ── render ──

    render(width: number): string[] {
        if (this.cache && this.cache.width === width) return this.cache.lines;

        const c = FG.cyan;
        const lines: string[] = [];

        // ╭── vivlos ──...──╮
        const labelPart = "── vivlos ──";
        const dashRight = Math.max(0, width - visibleWidth(labelPart) - 2);
        lines.push(c(`╭${labelPart}${"─".repeat(dashRight)}╮`));

        if (this.phase === "final") {
            // final: 只显示最终消息
            if (this.finalText) {
                const cl = wrapLines(this.finalText, width - 4);
                for (const cline of cl) {
                    lines.push(`${c("│")} ${truncateToWidth(cline, width - 4)} ${c("│")}`);
                }
            }
        } else {
            // thinking/tool: 显示 spinner + context + tool 条目
            const turnNum = TURN_NUMBERS[(this.turn - 1) % TURN_NUMBERS.length] ?? String(this.turn);
            const spin = BRAILLE[this.spinnerFrame % BRAILLE.length] ?? "?";

            // —— header line —— ① ⠋ Thinking... 或  Calling xxx
            if (this.phase === "thinking") {
                const header = FG.pink(`${turnNum} ${spin}  Thinking...`);
                lines.push(`${c("│")} ${header}${" ".repeat(Math.max(0, width - visibleWidth(header) - 4))} ${c("│")}`);

                // thinking context (3 lines max)
                const ctxLines = wrapLines(this.thinkingContext, width - 8);
                const limited = ctxLines.slice(0, 3);
                for (const ctx of limited) {
                    const arrow = FG.gray("╰─>");
                    lines.push(`${c("│")}   ${arrow} ${truncateToWidth(ctx, width - 11)} ${c("│")}`);
                }
                if (ctxLines.length > 3) {
                    lines.push(`${c("│")}   ${FG.gray("╰─>")} ${FG.gray("...(truncated)")} ${c("│")}`);
                }
            }

            // —— tool 条目 ——
            for (const tool of this.tools) {
                const toolHeader = FG.yellow(`${turnNum} ${spin}  Calling ${tool.name}`);
                lines.push(`${c("│")} ${toolHeader}${" ".repeat(Math.max(0, width - visibleWidth(toolHeader) - 4))} ${c("│")}`);

                if (tool.result) {
                    const resLines = wrapLines(tool.result, width - 8);
                    const limited = resLines.slice(0, 2);
                    for (const rl of limited) {
                        const arrow = tool.done ? FG.gray("╰─>") : FG.yellow("╰─>");
                        lines.push(`${c("│")}   ${arrow} ${truncateToWidth(rl, width - 11)} ${c("│")}`);
                    }
                }
            }
        }

        lines.push(c(`╰${"─".repeat(width - 2)}╯`));
        this.cache = { width, lines };
        return lines;
    }

    // ── spinner ──

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