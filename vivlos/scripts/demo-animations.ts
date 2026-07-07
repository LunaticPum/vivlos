// 终端动画演示——用 ANSI 序列直接在 stdout 输出各个 agent 状态的动画效果
// 运行: npx tsx vivlos/scripts/demo-animations.ts

const RESET = "\x1b[0m";
const CLEAR = "\x1b[2J\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

// braille 字符池
const BRAILLE = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];

// 粉色渐变色（256色表）
const PINK = [218,211,204,205,206,207,213,219,225];

function pink(s: string, idx: number): string {
	return `\x1b[38;5;${PINK[idx % PINK.length]}m${s}${RESET}`;
}
function gray(s: string): string { return `\x1b[90m${s}${RESET}`; }
function blue(s: string): string { return `\x1b[34m${s}${RESET}`; }
function green(s: string): string { return `\x1b[32m${s}${RESET}`; }

async function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

async function demo(): Promise<void> {
	process.stdout.write(CLEAR + HIDE_CURSOR);

	// ────── Frame 1: Turn Start ──────
	console.log(gray("┌─ agent:turn_start (轮次 #2) ────────────┐"));
	for (let i = 0; i < 20; i++) {
		const char = BRAILLE[Math.floor(Math.random() * BRAILLE.length)];
		const line = `│  ${pink(char, i)}  ${pink("Turn #2 started", i)}`;
		process.stdout.write(`\x1b[3;0H${line}${pink("│", i)}\n`);
		await sleep(80);
	}

	// ────── Frame 2: Thinking ──────
	console.log(gray("\n├─ agent thinking ─────────────────────────┤"));
	for (let i = 0; i < 30; i++) {
		const char = BRAILLE[Math.floor(Math.random() * BRAILLE.length)];
		const thought = "...analyzing the request...".slice(0, i % 30);
		const line = `│  ${pink(char, i)}  ${thought}`;
		process.stdout.write(`\x1b[5;0H${line}${" ".repeat(20)}${pink("│", i)}\n`);
		await sleep(100);
	}

	// ────── Frame 3: Tool Call ──────
	console.log(gray("\n├─ agent:toolCall_start (bash) ────────────┤"));
	for (let i = 0; i < 20; i++) {
		const char = BRAILLE[Math.floor(Math.random() * BRAILLE.length)];
		const progress = "█".repeat(i % 11) + "░".repeat(10 - (i % 11));
		const line = `│  ${pink(char, i)}  bash: ${progress} ${(i%11)*10}%`;
		process.stdout.write(`\x1b[7;0H${line}${" ".repeat(20)}${pink("│", i)}\n`);
		await sleep(120);
	}

	// ────── Frame 4: Tool Result ──────
	console.log(gray("\n├─ agent:toolCall_end ──────────────────────┤"));
	process.stdout.write(`\x1b[9;0H│  ${green("✓")}  bash: exit 0 (12 lines, 3.2s)\n`);
	await sleep(1500);

	// ────── Frame 5: Turn End ──────
	console.log(gray("\n└─ agent:turn_complete (2 messages) ───────┘"));
	for (let i = 0; i < 10; i++) {
		const char = BRAILLE[Math.floor(Math.random() * BRAILLE.length)];
		const line = `│  ${pink(char, i)}  complete — ${i * 10}%`;
		process.stdout.write(`\x1b[11;0H${line}${" ".repeat(20)}${pink("│", i)}\n`);
		await sleep(100);
	}

	console.log("\n" + green("✓ 演示结束"));
	process.stdout.write(SHOW_CURSOR);
}

demo().catch(console.error);