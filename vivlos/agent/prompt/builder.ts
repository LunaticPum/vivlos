import type {
	PromptBuilder,
	PromptParts,
	PromptBuilderOptions,
} from "./types.ts";
import {
	DEFAULT_IDENTITY,
	DEFAULT_ENVIRONMENT,
	DEFAULT_RULES,
} from "./templates.ts";

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
		build() {
			const sections: string[] = [
				parts.identity,
				parts.environment,
				parts.rules,
			];
			// P6: memoryText 不再是单行文本，而是 MemoryManager.buildPrompt()
			// 生成的 Hermes 风格 ═══...═══ 大块
			// TODO: 后续 memory 块应放在 system prompt 最顶部
			// （Hermes 放在 identity 之后 rules 之前）
			if (memoryText) sections.push(memoryText);
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
