import type { Message, Model, Api } from "@earendil-works/pi-ai";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { LoopResult } from "./loop/types.ts";
import type { CompactionResult } from "./compression/types.ts";
import type { SessionMeta } from "@vivlos/infra/storage/session/index.ts";
import type { TodoList } from "@vivlos/infra/eventbus/index.ts";

/** agent 对外接口 -- entries 层 */
export interface VivlosAgent {
	/**
	 * 提交一次用户请求。
	 *
	 * modelOverride 用于整轮覆盖默认模型（如图片轮次指定视觉模型）。
	 */
	prompt(
		input: string | AgentMessage[],
		signal?: AbortSignal,
		modelOverride?: Model<Api>,
	): Promise<LoopResult>;
	/** 手动触发上下文压缩（/compact 命令用） */
	compact(): Promise<CompactionResult>;
	getMessages(): readonly Message[];
	/** 读取当前 Session 的完整 Todo List；不存在或读取失败时返回 null。 */
	getTodoList(): TodoList | null;

	/**
	 * 运行中插话：把消息压入 steering 队列，待 loop 在 turn 边界（steering）
	 * 或即将退出前（followUp）注入。相同文本未消费时去重。
	 * 返回排队消息 id 与是否命中去重。
	 */
	queueMessage(text: string): { id: string; deduplicated: boolean };

	/** 当前 session ID */
	getSessionId(): string;
	/** 当前 session 名称（可能为 null） */
	getSessionName(): string | null;

	// ── session 管理 ──
	listSessions(): SessionMeta[];
	switchSession(sessionId: string): void;
	createNewSession(name?: string): void;
	deleteSession(sessionId: string): void;
	renameSession(name: string): void;
}
