/**
 * Subagent 委派子会话事件（钻取视图数据通道）。
 *
 * 子 agent 会话本身是内存态（v1 不落盘）；
 * delegate tool 在执行期间以快照形式推送子会话消息，
 * TUI 缓存后即可在钻取视图中渲染（运行中实时刷新）。
 */

import type { Message } from "@earendil-works/pi-ai";

/** 子会话消息快照更新。 */
export interface DelegationTaskMessagesEvent {
	readonly type: "delegation:task_messages";
	/** 委派所属的主 session ID。 */
	readonly sessionId: string;
	/** 子任务唯一 ID（批次 callId:任务序号）。 */
	readonly taskId: string;
	readonly kind: "exploring" | "writing";
	readonly title: string;
	/** 子 agent 的会话消息快照（按时序）。 */
	readonly messages: readonly Message[];
	/** 子 agent 是否仍在运行。 */
	readonly running: boolean;
}

export type DelegationEvent = DelegationTaskMessagesEvent;
