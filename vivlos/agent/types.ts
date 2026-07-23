import type { Message } from "@earendil-works/pi-ai";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { LoopResult } from "./loop/types.ts";
import type { CompactionResult } from "./compression/types.ts";
import type { SessionMeta } from "@vivlos/infra/storage/session/index.ts";

/** agent 对外接口 -- entries 层 */
export interface VivlosAgent {
	prompt(input: string | AgentMessage[], signal?: AbortSignal): Promise<LoopResult>;
	/** 手动触发上下文压缩（/compact 命令用） */
	compact(): Promise<CompactionResult>;
	getMessages(): readonly Message[];

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
