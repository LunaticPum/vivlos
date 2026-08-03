import type { ShouldStopAfterTurnContext } from "@earendil-works/pi-agent-core";

/**
 * 创建 maxTurns 控制 hook。
 *
 * hook 实例绑定单次用户请求并跨底层 retry 累计 assistant turn。达到上限时始终停止，
 * 但只有未消费的 Tool Result 需要由调用方报告为截断错误。
 */
export function createMaxTurnsHook(maxTurns: number, onReached?: () => void) {
	let assistantTurns = 0;
	return {
		shouldStopAfterTurn(
			{ toolResults }: ShouldStopAfterTurnContext,
			toolResultsRequireFollowUp = toolResults.length > 0,
		): boolean {
			assistantTurns++;
			const reached = assistantTurns >= maxTurns;
			if (reached && toolResultsRequireFollowUp) onReached?.();
			return reached;
		},
	};
}
