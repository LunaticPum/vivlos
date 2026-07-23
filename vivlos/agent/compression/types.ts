import type { Message, Model, Api } from "@earendil-works/pi-ai";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { CompressionConfig } from "@vivlos/infra/config/index.ts";

// #region Session 持久化

// CompactionEntry 定义在 infra/storage/session/types.ts（存储层拥有数据格式）
export type { CompactionEntry } from "@vivlos/infra/storage/session/types.ts";

// #endregion

// #region 压缩结果

/** 一次压缩操作的返回结果 */
export interface CompactionResult {
	/** 压缩后的新消息列表（head + 摘要消息 + tail） */
	messages: Message[];
	/** 生成的摘要文本 */
	summary: string;
	/** 被压缩的消息数量（middle 段） */
	compactedCount: number;
	/** 是否无效压缩（middle 为空，什么都没压） */
	noOp: boolean;
}

// #endregion

// #region 压缩器依赖

/** 压缩器运行时依赖 */
export interface CompactorDeps {
	/** LLM 客户端（用于摘要生成） */
	llm: LLMClient;
	/** 用于摘要的模型（默认为当前对话模型） */
	model: Model<Api>;
	/** 压缩配置（从 config.json 加载） */
	config: CompressionConfig;
}

// #endregion

// #region 防抖状态

/** 压缩防抖状态（跨 turn 维护） */
export interface CompactionState {
	/** 连续无效压缩次数 */
	consecutiveNoOp: number;
	/** 是否已暂停自动触发（达到 maxConsecutiveNoOp） */
	autoPaused: boolean;
	/** 上一次摘要文本（用于增量更新） */
	lastSummary: string | null;
}

// #endregion
