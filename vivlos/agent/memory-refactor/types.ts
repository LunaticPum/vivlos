/**
 * Memory 领域共享契约。
 *
 * 这里只放确实需要跨 Security、Memory logic 和 Service 共享的基础类型。
 * 各模块内部结果和错误类型应留在对应脚本中，避免公共类型持续膨胀。
 */

// #region 操作主体

/**
 * 当前允许发起 Memory 操作的模型主体。
 *
 * - main：主模型，负责用户对话中的主动记忆。
 * - consolidator：巩固模型，负责整理和强化已有记忆。
 */
export const MEMORY_ACTORS = ["main", "consolidator"] as const;

export type MemoryActor = (typeof MEMORY_ACTORS)[number];

// #endregion

// #region 记忆操作

/**
 * L1 Memory 支持的完整操作集合。
 *
 * 该常量只描述系统具备哪些操作，不代表每个 actor 都拥有全部权限；
 * 主模型和巩固模型的白名单由 security.ts 单独定义。
 */
export const MEMORY_ACTIONS = [
	"add",
	"replace",
	"remove",
	"merge",
	"refine",
] as const;

export type MemoryAction = (typeof MEMORY_ACTIONS)[number];

// #endregion
