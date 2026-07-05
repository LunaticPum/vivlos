/**
 * Memory 持久化层类型定义。
 *
 * 参照 Hermes 的双存储模型：
 * - memory：agent 的工作笔记（环境、项目进度、技术细节）
 * - user：用户画像（偏好、习惯、约束）
 */

/** memory 条目的存储格式 */
export interface MemoryEntry {
	readonly id: string;
	readonly content: string;
	readonly createdAt: number;
	readonly updatedAt: number;
}

/** memory 后端接口——可插拔（builtin SQLite / Mem0 / ...） */
export interface MemoryBackend {
	/** 读取所有 memory 条目 */
	readAll(target: "memory" | "user"): Promise<readonly MemoryEntry[]>;
	/** 添加一条 memory（内置 ID 生成） */
	add(target: "memory", content: string): Promise<void>;
	/** 替换旧条目为新内容 */
	replace(target: "memory", oldText: string, newText: string): Promise<void>;
	/** 删除匹配的条目 */
	remove(target: "memory", oldText: string): Promise<void>;
	/** 更新用户画像 */
	setProfile(content: string): Promise<void>;
	/** 读取用户画像 */
	getProfile(): Promise<string>;
}

/**
 * MemoryManager —— agent 层使用的接口。
 *
 * 封装 MemoryBackend，加上 prompt 注入逻辑。
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
	list(): Promise<readonly MemoryEntry[]>;

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
