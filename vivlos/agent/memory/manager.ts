import type { MemoryRepository, MemoryManager, MemoryEntry } from "./types.ts";
import { createSqliteMemoryRepository } from "@vivlos/infra/storage/index.ts";

const MAX_MEMORY_CHARS = 2200; // 和 Hermes 保持一致
// TODO: 后续做成可配置项（config.yaml 或 .env），而非硬编码

/**
 * 创建 MemoryManager。
 *
 * 封装 MemoryRepository，加上 prompt 注入逻辑。
 */
export function createMemoryManager(dbPath: string): MemoryManager {
	const repo = createSqliteMemoryRepository(dbPath);

	return {
		// ── agent memory CRUD ──
		// TODO: 后续以 AgentTool 形式（memory 工具）暴露给 LLM，当前只做 API
		async add(content) {
			repo.addMemory(content);
		},

		async replace(oldText, newText) {
			repo.replaceMemory(oldText, newText);
		},

		async remove(oldText) {
			repo.removeMemory(oldText);
		},

		async list() {
			return repo.readAllMemories();
		},

		async setProfile(content) {
			repo.setProfile(content);
		},

		async getProfile() {
			return repo.getProfile();
		},

		async buildPrompt() {
			const [memoryEntries, profile] = await Promise.all([
				Promise.resolve(repo.readAllMemories()),
				Promise.resolve(repo.getProfile()),
			]);

			const sections: string[] = [];

			// ── agent memory ──
			const memoryContent = memoryEntries
				.map((e: MemoryEntry) => e.content)
				.join("\n§\n");
			if (memoryContent) {
				const memoryBlock = formatBlock("MEMORY (agent notes)", memoryContent);
				sections.push(memoryBlock);
			}

			// ── user profile ──
			if (profile) {
				const profileBlock = formatBlock("USER PROFILE", profile);
				sections.push(profileBlock);
			}

			return sections.join("\n\n");
		},
	};
}

/** 格式化 Hermes 风格的 ── 分隔块 */
function formatBlock(title: string, body: string): string {
	const BORDER = "═".repeat(42);
	const used = body.length;
	const pct = Math.round((used / MAX_MEMORY_CHARS) * 100);

	let header = `${BORDER}\n${title}`;
	if (used > MAX_MEMORY_CHARS * 0.5) {
		header += ` [${pct}% — ${used.toLocaleString()}/${MAX_MEMORY_CHARS.toLocaleString()} chars]`;
	}
	header += `\n${BORDER}`;

	// 超限时精简——先从 § 分隔的条目中删除最老条目，仍超限则硬截断
	// TODO: 后续改成基于 updated_at 的精确裁剪（当前按 § 分隔近似）
	// TODO: 截断后应加 `...[N older entries trimmed]...` 标记而非直接丢弃
	let output = body;
	if (used > MAX_MEMORY_CHARS) {
		const entries = body.split("\n§\n");
		// 从前面裁剪掉最老的条目
		while (output.length > MAX_MEMORY_CHARS && entries.length > 1) {
			entries.shift();
			output = entries.join("\n§\n");
		}
		if (output.length > MAX_MEMORY_CHARS) {
			output = output.slice(0, MAX_MEMORY_CHARS) + "\n...[truncated]";
		}
	}

	return `${header}\n${output}`;
}
