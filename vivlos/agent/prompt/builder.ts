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
		 * 段落顺序（参照 pi-agent-core）：
		 *   1. identity    - "你是 vivlos，..."
		 *   2. environment - "运行环境 / 工作目录 / 可用工具"
		 *   3. skills      - 可用 skills 列表（XML 格式，可选）
		 *   4. memory      - 记忆块（可选，后续引入 MemoryManager）
		 *   5. rules       - 行为约束
		 */
		build() {
			const sections: string[] = [parts.identity, parts.environment];
			if (skillsText) sections.push(skillsText);
			if (memoryText) sections.push(memoryText);
			sections.push(parts.rules);
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
