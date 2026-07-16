export interface PromptBuilderOptions {
	/** 覆盖默认 identity 模板 */
	readonly identity?: string;
	/** 覆盖默认 rules 模板 */
	readonly rules?: string;
}

export interface PromptBuilder {
	build(): string;
	setMemory(text: string): void;
	setSkills(text: string): void;
}
