/**
 * MemoryManager -- Markdown 文件实现。
 *
 * 参照 Hermes L1 Markdown Memory（02-memory.md §1.1-1.3）：
 * - memory.md: agent 笔记（--- 分隔，cap ~2200 字符）
 * - user.md: 用户画像（cap ~1375 字符）
 *
 * buildPrompt() 从 Markdown 文件读取并格式化注入 SP。
 * CRUD 由 memory tool 直接操作文件（Phase 1 已实现），不经过 MemoryManager。
 *
 * Frozen Snapshot 语义：
 * - Session 启动时 buildPrompt() 读盘 -> 冻结进 SP
 * - memory tool 写盘后当前 session SP 不变
 * - 下个 session 启动才带上新写入
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { MemoryManager } from "./types.ts";

/** 条目分隔符（与 memory tool 保持一致） */
const SEPARATOR = "\n---\n";

/** 字符上限（与 Hermes 保持一致，后续可移入 config） */
const MEMORY_CAP = 2200;
const USER_CAP = 1375;

/** 读取 Markdown 文件的条目列表 */
function readEntries(filePath: string): string[] {
	if (!existsSync(filePath)) return [];
	const raw = readFileSync(filePath, "utf-8").trim();
	if (!raw) return [];
	return raw
		.split(SEPARATOR)
		.map((e) => e.trim())
		.filter((e) => e.length > 0);
}

/** 读取文件字符数 */
function fileLength(filePath: string): number {
	if (!existsSync(filePath)) return 0;
	return readFileSync(filePath, "utf-8").length;
}

/**
 * 创建 MemoryManager。
 *
 * buildPrompt() 从 Markdown 文件读取并格式化注入 SP。
 * CRUD 由 memory tool 直接操作文件，不经过 MemoryManager。
 */
export function createMemoryManager(memoriesDir: string): MemoryManager {
	const memoryPath = resolve(memoriesDir, "memory.md");
	const userPath = resolve(memoriesDir, "user.md");

	return {
		async buildPrompt() {
			const sections: string[] = [];

			// ── agent memory ──
			const memoryEntries = readEntries(memoryPath);
			if (memoryEntries.length > 0) {
				const content = memoryEntries.join("\n---\n");
				sections.push(formatBlock("MEMORY (agent notes)", content, MEMORY_CAP));
			}

			// ── user profile ──
			const userEntries = readEntries(userPath);
			if (userEntries.length > 0) {
				const content = userEntries.join("\n---\n");
				sections.push(formatBlock("USER PROFILE", content, USER_CAP));
			}

			return sections.join("\n\n");
		},

		getUsage() {
			return {
				memory: { used: fileLength(memoryPath), cap: MEMORY_CAP },
				user: { used: fileLength(userPath), cap: USER_CAP },
			};
		},
	};
}

/**
 * 格式化 Hermes 风格的记忆块。
 *
 * 用量超过 50% 时在 header 显示百分比，超限则从前面裁剪旧条目。
 */
function formatBlock(title: string, body: string, cap: number): string {
	const BORDER = "═".repeat(42);
	const used = body.length;
	const pct = Math.round((used / cap) * 100);

	let header = `${BORDER}\n${title}`;
	if (used > cap * 0.5) {
		header += ` [${pct}% — ${used.toLocaleString()}/${cap.toLocaleString()} chars]`;
	}
	header += `\n${BORDER}`;

	// 超限时从前面裁剪旧条目
	let output = body;
	if (used > cap) {
		const entries = body.split(SEPARATOR);
		while (output.length > cap && entries.length > 1) {
			entries.shift();
			output = entries.join(SEPARATOR);
		}
		if (output.length > cap) {
			output = output.slice(0, cap) + "\n...[truncated]";
		}
	}

	return `${header}\n${output}`;
}
