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
	/** 设置压缩历史摘要（压缩后调用，触发下轮 re-freeze 带上此段） */
	setCompactedHistory(text: string): void;
	/** 冻结当前状态为 cached system prompt（Session 级，同 session 内复用） */
	freeze(): void;
	/** 返回冻结的 SP；未冻结时自动冻结 */
	getCached(): string;
	/** SP 是否已冻结 */
	isFrozen(): boolean;
	/** 使冻结快照失效（session 切换/新建/压缩时调用，下轮 lazy re-freeze） */
	invalidate(): void;
}
