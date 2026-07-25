/**
 * MemoryManager -- Markdown 文件实现。
 *
 * 参照 Hermes L1 Markdown Memory（02-memory.md §1.1-1.3）：
 * - memory.md: agent 笔记（--- 分隔）
 * - user.md: 用户画像
 *
 * buildPrompt() 通过 MemoryStore 读取并格式化注入 SP。
 * 字符上限来自 config.json，CRUD 与用量统计均以 MemoryStore 为准。
 *
 * Frozen Snapshot 语义：
 * - Session 启动时 buildPrompt() 读盘 -> 冻结进 SP
 * - memory tool 写盘后当前 session SP 不变
 * - 下个 session 启动才带上新写入
 */

import type { MemoryManager, MemoryStore, MemoryUsage } from "./types.ts";

/** 条目分隔符（与 MemoryStore 保持一致） */
const SEPARATOR = "\n---\n";

// #region MemoryManager 主入口

/**
 * 创建 MemoryManager。
 *
 * buildPrompt() 通过 MemoryStore 读取 Markdown 并格式化注入 SP。
 * CRUD 由 memory tool 和 Dreaming 通过同一个 Store 执行。
 */
export function createMemoryManager(store: MemoryStore): MemoryManager {
	return {
		async buildPrompt() {
			const sections: string[] = [];

			// ── agent memory ──
			const memoryEntries = store.read("memory");
			if (memoryEntries.length > 0) {
				const content = memoryEntries.join("\n---\n");
				sections.push(
					formatBlock("MEMORY (agent notes)", content, store.getUsage("memory")),
				);
			}

			// ── user profile ──
			const userEntries = store.read("user");
			if (userEntries.length > 0) {
				const content = userEntries.join("\n---\n");
				sections.push(formatBlock("USER PROFILE", content, store.getUsage("user")));
			}

			return sections.join("\n\n");
		},

		getUsage() {
			return {
				memory: store.getUsage("memory"),
				user: store.getUsage("user"),
			};
		},
	};
}

// #endregion

// #region Prompt 格式化

/**
 * 格式化 Hermes 风格的记忆块。
 *
 * 用量超过 50% 时在 header 显示百分比，超限则从前面裁剪旧条目。
 */
function formatBlock(title: string, body: string, usage: MemoryUsage): string {
	const BORDER = "═".repeat(42);
	const { used, cap } = usage;
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

// #endregion
