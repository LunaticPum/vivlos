import { randomUUID } from "node:crypto";
import type {
	MemoryCommandContext,
	MemoryCommandContextController,
} from "../types.ts";

interface ActiveContext {
	readonly sessionId: string;
	readonly runId: string;
	readonly sourceMessageIds: readonly string[];
	turn: number;
}

/** 在单次 Agent run 内维护 Memory Event 所需的来源信息。 */
export function createMemoryCommandContextController(): MemoryCommandContextController {
	let active: ActiveContext | null = null;

	return {
		begin(sessionId, sourceMessageIds) {
			if (active) throw new Error("已有活动的 Memory command context");
			active = {
				sessionId,
				runId: randomUUID(),
				sourceMessageIds: [...sourceMessageIds],
				turn: 1,
			};
		},

		setTurn(turn) {
			if (!active) throw new Error("Memory command context 尚未开始");
			active.turn = turn;
		},

		current() {
			if (!active) throw new Error("memory tool 不在活动的 Agent run 中");
			return {
				sessionId: active.sessionId,
				turnId: `${active.runId}:turn:${active.turn}`,
				sourceMessageIds: [...active.sourceMessageIds],
			};
		},

		clear() {
			active = null;
		},
	};
}
