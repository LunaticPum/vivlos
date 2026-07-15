import type {
	PromptParts,
	PromptBuilder,
	PromptBuilderOptions,
} from "./types.ts";
import {
	DEFAULT_IDENTITY,
	DEFAULT_RULES,
	buildEnvironment,
} from "./templates.ts";

/**
 * 创建 system prompt 组装器。
 *
 * 段落顺序（参照 pi-agent-core）：
 *   identity -> environment -> skills -> memory -> rules
 *
 * environment 每次 build() 时动态生成（包含实时时间/时区）。
 */
export function createPromptBuilder(
	options: PromptBuilderOptions = {},
): PromptBuilder {
	const parts: PromptParts = {
		identity: options.identity ?? DEFAULT_IDENTITY,
		rules: options.rules ?? DEFAULT_RULES,
	};
	let memoryText: string | undefined;
	let skillsText: string | undefined;

	return {
		build() {
			const sections: string[] = [parts.identity, buildEnvironment()];
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
