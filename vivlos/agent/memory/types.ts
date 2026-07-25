/**
 * MemoryManager -- agent 层使用的接口。
 *
 * 参照 Hermes L1 Markdown Memory（02-memory.md §1.1-1.3）。
 * Markdown CRUD 统一由 MemoryStore 负责，MemoryManager 只负责：
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

// #region MemoryStore 类型

/** Markdown 记忆文件类型 */
export type MemoryFile = "memory" | "user";

/** 两类记忆文件各自的字符上限 */
export interface MemoryLimits {
	readonly memory: number;
	readonly user: number;
}

export type MemoryStoreErrorCode =
	| "invalid_input"
	| "unsafe_content"
	| "not_found"
	| "ambiguous_match"
	| "capacity_exceeded";

export interface MemoryStoreError {
	readonly code: MemoryStoreErrorCode;
	readonly message: string;
}

export interface MemoryMutation {
	readonly status: "written" | "duplicate";
	readonly file: MemoryFile;
	readonly content: string;
	readonly usage: MemoryUsage;
}

export type MemoryMutationResult =
	| { readonly ok: true; readonly value: MemoryMutation }
	| { readonly ok: false; readonly error: MemoryStoreError };

/** Markdown Memory 的唯一读写入口 */
export interface MemoryStore {
	read(file: MemoryFile): string[];
	add(file: MemoryFile, content: string): MemoryMutationResult;
	replace(file: MemoryFile, oldText: string, newText: string): MemoryMutationResult;
	remove(file: MemoryFile, oldText: string): MemoryMutationResult;
	getUsage(file: MemoryFile): MemoryUsage;
}

// #endregion

// #region MemoryManager 类型

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

// #endregion
