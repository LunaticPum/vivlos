import type { Usage } from "@earendil-works/pi-ai";

/**
 * 从 Usage 计算上下文 token 总量。
 *
 * input + cacheRead + cacheWrite = 实际占用的上下文窗口。
 * 各处重复的公式统一收口到此。
 */
export function getContextTokens(usage: Usage): number {
	return usage.input + usage.cacheRead + usage.cacheWrite;
}

/**
 * 格式化 token 数为简洁显示。
 *
 * 1500000 -> "1M"
 * 15000    -> "15k"
 * 1500     -> "1.5k"
 * 500      -> "500"
 */
export function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)}M`;
	if (n >= 10_000) return `${Math.floor(n / 1_000)}k`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return `${n}`;
}
