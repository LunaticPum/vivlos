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
