/**
 * L2 索引概览读取。
 *
 * 从 memory.db 读取 Workspace 级索引统计，供 TUI 侧栏展示。
 * 纯只读查询，不修改索引。
 */

import type { Database } from "bun:sqlite";

export interface L2Overview {
	/** 已索引的 Session 数量。 */
	readonly sessionCount: number;
	/** 已索引的消息条数。 */
	readonly messageCount: number;
	/** 最近一次索引覆盖的会话活跃时间；无索引时为 null。 */
	readonly lastIndexedAt: number | null;
}

export function readL2Overview(db: Database): L2Overview {
	const sessions = db
		.prepare("SELECT COUNT(*) AS count FROM l2_sessions")
		.get() as { count: number };
	const messages = db
		.prepare("SELECT COUNT(*) AS count FROM l2_messages")
		.get() as { count: number };
	const last = db
		.prepare("SELECT MAX(last_active_at) AS last FROM l2_sessions")
		.get() as { last: number | null };
	return {
		sessionCount: sessions.count,
		messageCount: messages.count,
		lastIndexedAt: last.last ?? null,
	};
}
