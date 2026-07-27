/** Memory 模块公共类型 */

/** 单个文件的用量信息 */
export interface MemoryUsage {
	readonly used: number;
	readonly cap: number;
}

/** 当前两类 Markdown Memory 的一致读取结果 */
export interface MemoryStoreSnapshot {
	readonly entries: {
		readonly memory: readonly string[];
		readonly user: readonly string[];
	};
	readonly usage: {
		readonly memory: MemoryUsage;
		readonly user: MemoryUsage;
	};
	/** 基于规范化 memory.md + user.md 内容计算的版本哈希 */
	readonly revision: string;
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
	readonly before?: string;
	readonly after?: string;
	readonly usage: MemoryUsage;
}

export type MemoryMutationResult =
	| { readonly ok: true; readonly value: MemoryMutation }
	| { readonly ok: false; readonly error: MemoryStoreError };

/** Markdown Memory 的唯一读写入口 */
export interface MemoryStore {
	readSnapshot(): MemoryStoreSnapshot;
	add(file: MemoryFile, content: string): MemoryMutationResult;
	replace(file: MemoryFile, oldText: string, newText: string): MemoryMutationResult;
	remove(file: MemoryFile, oldText: string): MemoryMutationResult;
}

// #endregion

// #region MemoryService 类型

/** 主模型声明在线记忆操作原因时可使用的稳定分类 */
export const MAIN_MEMORY_REASON_CODES = [
	"explicit_user_request",
	"explicit_user_forget",
	"user_correction",
	"stable_project_decision",
	"preference_observed",
] as const;

export type MainMemoryReasonCode = (typeof MAIN_MEMORY_REASON_CODES)[number];

export interface MemoryCommandReason {
	readonly reasonCode: MainMemoryReasonCode;
	readonly reason?: string;
}

/** 主模型可提交的在线 Memory CRUD 命令 */
export type MemoryCommand = MemoryCommandReason &
	(
		| {
			readonly action: "add";
			readonly file: MemoryFile;
			readonly content: string;
		  }
		| {
			readonly action: "replace";
			readonly file: MemoryFile;
			readonly oldText: string;
			readonly newText: string;
		  }
		| {
			readonly action: "remove";
			readonly file: MemoryFile;
			readonly oldText: string;
		  }
	);

/** 主模型 Memory 命令引用的当前 session/turn 消息来源。 */
export interface MemoryCommandContext {
	readonly sessionId: string;
	readonly turnId: string;
	readonly sourceMessageIds: readonly string[];
}

export interface MemoryCommandContextController {
	begin(sessionId: string, sourceMessageIds: readonly string[]): void;
	setTurn(turn: number): void;
	current(): MemoryCommandContext;
	clear(): void;
}

export type MemoryCommandErrorCode =
	| "invalid_input"
	| "not_found"
	| "ambiguous_match"
	| "capacity_exceeded"
	| "unsafe_content"
	| "forbidden_operation";

export interface MemoryCommandError {
	readonly code: MemoryCommandErrorCode;
	readonly message: string;
}

/** Service 只暴露受影响条目，不泄漏完整 Memory snapshot。 */
export interface MemoryCommandMutation {
	readonly status: "committed" | "noop";
	readonly file: MemoryFile;
	readonly before?: string;
	readonly after?: string;
	readonly usage: MemoryUsage;
}

interface MemoryCommandResultBase {
	readonly command: MemoryCommand;
	readonly revisionBefore: string;
	readonly revisionAfter: string;
}

export type MemoryCommandResult = MemoryCommandResultBase &
	(
		| { readonly ok: true; readonly value: MemoryCommandMutation }
		| { readonly ok: false; readonly error: MemoryCommandError }
	);

/** Memory 在线命令的统一业务入口 */
export interface MemoryService {
	executeMainCommand(
		command: MemoryCommand,
		context: MemoryCommandContext,
	): MemoryCommandResult;
}

// #endregion

// #region MemorySnapshot 类型

/** 读取 Markdown 当前状态并构造可冻结的 System Prompt 内容 */
export interface MemorySnapshot {
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
	buildPrompt(): string;
}

// #endregion
