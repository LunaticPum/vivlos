/**
 * Memory 持久化层类型定义。
 *
 * 参照 Hermes 的双存储模型：
 * - memory：agent 的工作笔记（环境、项目进度、技术细节）
 * - user：用户画像（偏好、习惯、约束）
 *
 * MemoryEntry / MemoryRepository 在 infra/storage/repo/memory-repo.ts 定义，
 * 此处 re-export 供 agent 层使用。
 */
export type { MemoryEntry, MemoryRepository } from "@vivlos/infra/storage/index.ts";

/**
 * MemoryManager —— agent 层使用的接口。
 *
 * 封装 MemoryRepository，加上 prompt 注入逻辑。
 * 参照 Hermes memory tool 的设计（add/replace/remove + 字符预算）。
 */
export interface MemoryManager {
	/** 添加 agent memory */
	add(content: string): Promise<void>;
	/** 替换 agent memory */
	replace(oldText: string, newText: string): Promise<void>;
	/** 删除 agent memory */
	remove(oldText: string): Promise<void>;
	/** 获取所有 agent memory */
	list(): Promise<readonly import("@vivlos/infra/storage/index.ts").MemoryEntry[]>;

	/** 设置用户画像 */
	setProfile(content: string): Promise<void>;
	/** 获取用户画像 */
	getProfile(): Promise<string>;

	/**
	 * 构建注入 system prompt 的 memory 块。
	 *
	 * 格式参照 Hermes：
	 * ══════════════════════════════════════════════
	 * MEMORY (your personal notes) [XX% — used/total chars]
	 * ══════════════════════════════════════════════
	 * entry1
	 * entry2
	 * ...
	 *
	 * 字符预算：默认 2200 chars（和 Hermes 保持一致）。
	 * 超限时精简（优先保留最近更新的条目），并追加 `...truncated` 标记。
	 */
	buildPrompt(): Promise<string>;
}