import type { ShouldStopAfterTurnContext } from "@earendil-works/pi-agent-core";

/**
 * 创建 maxTurns 控制 hook。
 *
 * 按 newMessages 里的 assistant 消息数计数，
 * 达到上限时 shouldStopAfterTurn 返回 true，loop 正常结束当前 turn 后退出。
 */
export function createMaxTurnsHook(maxTurns: number) {
	return {
		shouldStopAfterTurn({ newMessages }: ShouldStopAfterTurnContext): boolean {
			const assistantCount = newMessages.filter(
				(m) => m.role === "assistant",
			).length;
			return assistantCount >= maxTurns;
		},
	};
}
