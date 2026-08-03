import type { AssistantMessage } from "@earendil-works/pi-ai/compat";
import {
	isContextOverflow,
	isRetryableAssistantError,
} from "@earendil-works/pi-ai/compat";

/** Context overflow 由 Compaction 处理，其余分类遵从 pi 的瞬时错误策略。 */
export function isRetryableAgentError(
	message: AssistantMessage,
	contextWindow: number,
): boolean {
	if (isContextOverflow(message, contextWindow)) return false;
	return isRetryableAssistantError(message);
}

export function getRetryDelayMs(baseDelayMs: number, attempt: number): number {
	return baseDelayMs * 2 ** (attempt - 1);
}

/** 等待下一次重试；用户 Abort 时立即拒绝，不启动新的 Provider 请求。 */
export function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Retry cancelled"));
			return;
		}

		const onAbort = () => {
			clearTimeout(timer);
			reject(new Error("Retry cancelled"));
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, delayMs);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
