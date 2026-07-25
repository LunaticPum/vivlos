/**
 * MemoryManager -- agent 层使用的接口。
 *
 * 参照 Hermes L1 Markdown Memory（02-memory.md §1.1-1.3）。
 * CRUD 由 memory tool 直接操作 Markdown 文件，MemoryManager 只负责：
 * - buildPrompt(): 读取 memory.md + user.md，格式化注入 SP
 * - getUsage(): 返回当前用量（SideBar 显示用）
 *
 * Frozen Snapshot 语义：
 * - Session 启动时 buildPrompt() 读盘 -> 冻结进 SP
 * - memory tool 写盘后当前 session SP 不变
 * - 下个 session 启动才带上新写入
 */

/** 单个文件的用量信息 */
export interface MemoryUsage {
	readonly used: number;
	readonly cap: number;
}

export interface MemoryManager {
	/**
	 * 构建注入 system prompt 的 memory 块。
	 *
	 * 格式参照 Hermes：
	 * ══════════════════════════════════════════════
	 * MEMORY (agent notes) [XX% — used/total chars]
	 * ══════════════════════════════════════════════
	 * entry1
	 * ---
	 * entry2
	 */
	buildPrompt(): Promise<string>;

	/** 获取 memory.md 和 user.md 的当前用量（SideBar 显示用） */
	getUsage(): { memory: MemoryUsage; user: MemoryUsage };
}
