export interface PromptParts {
	readonly identity: string;
	readonly rules: string;
	readonly memory?: string;
	readonly skills?: string;
}

export interface PromptBuilderOptions {
	readonly identity?: string;
	readonly rules?: string;
}

export interface PromptBuilder {
	build(): string;
	setMemory(text: string): void;
	setSkills(text: string): void;
}
