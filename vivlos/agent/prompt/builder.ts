import type {
	PromptParts,
	PromptBuilder,
	PromptBuilderOptions,
} from "./types.ts";
import {
	DEFAULT_IDENTITY,
	DEFAULT_ENVIRONMENT,
	DEFAULT_RULES,
} from "./templates.ts";

/**
 * 创建 system prompt 组装器。
 *
 * 按固定布局拼接 identity → environment → memory → rules → skills，
 * 每个 prompt 周期由 agent-loop 调用 build() 生成最终 system prompt 文本。
 */
export function createPromptBuilder(
	options: PromptBuilderOptions = {},
): PromptBuilder {
	const parts: PromptParts = {
		identity: options.identity ?? DEFAULT_IDENTITY,
		environment: options.environment ?? DEFAULT_ENVIRONMENT,
		rules: (options.rules ?? DEFAULT_RULES).join("\n"),
	};
	let memoryText: string | undefined;
	let skillsText: string | undefined;

	return {
		/**
		 *   1. identity    — "你是 vivlos，..."
		 *   2. environment — "当前时间 / OS / 工作目录"
		 *   3. memory      — Hermes 风格 ═══ MEMORY ═══ 块（可选）
		 *   4. rules       — 行为约束
		 *   5. skills      — 可用的 skills 列表（可选）
		 */
		build() {
			const sections: string[] = [parts.identity, parts.environment];
			if (memoryText) sections.push(memoryText);
			sections.push(parts.rules);
			if (skillsText) sections.push(skillsText);
			return sections.join("\n\n---\n\n");
		},
		setMemory(text: string) {
			memoryText = text;
		},
		setSkills(text: string) {
			skillsText = text;
		},
	};
}
