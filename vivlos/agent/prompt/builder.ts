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
