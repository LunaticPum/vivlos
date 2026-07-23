/**
 * Skill 系统类型定义。
 *
 * 设计基于渐进式披露（progressive disclosure）三层架构：
 *
 *   第一层 - metadata（始终在 system prompt 中）
 *     仅 name + description + location，LLM 据此做意图匹配。
 *
 *   第二层 - SKILL.md 正文（skill 激活时加载）
 *     完整的执行流程 SOP、决策树、自查清单。
 *     LLM 调用 skill({ name }) 工具获取，工具内部读取文件返回。
 *
 *   第三层 - references/（skill 激活后按需加载）
 *     补充资料（新闻源列表、格式模板等）。
 *     LLM 调用 skill({ name, reference: "filename" }) 加载。
 *
 * skill 工具自包含文件读取，不依赖 read 工具。
 * bash 权限控制通过 .vivlos/config.json 的 tool.bash 外置配置。
 */

/** Skill 来源类型 */
export type SkillSource = "builtin" | "extension";

// ── 元数据 ──

/**
 * Skill 元数据 -- 从 SKILL.md 的 YAML frontmatter 解析。
 *
 * 只解析 name + description，其他 frontmatter 字段忽略。
 * 第三方 SKILL.md 的额外字段（compatibility、allowed-tools 等）不影响解析。
 */
export interface SkillMetadata {
	/** skill 唯一标识（kebab-case） */
	readonly name: string;
	/**
	 * 简短描述：何时使用此 skill。
	 * LLM 据此做意图匹配，需明确触发条件和反触发条件。
	 */
	readonly description: string;
}

// ── 注册表 ──

/**
 * Skill 注册项 -- 注册表内部存储单元。
 *
 * 只含 metadata + 路径信息（轻量），
 * 正文和 references 由 skill 工具按需读取。
 */
export interface SkillEntry {
	readonly metadata: SkillMetadata;
	/** skill 目录的绝对路径 */
	readonly dir: string;
	/** SKILL.md 文件的绝对路径 */
	readonly filePath: string;
	/** 来源：builtin（自研）或 extension（第三方拉取） */
	readonly source: SkillSource;
}

/**
 * Skill 注册表 -- 启动时扫描 + 注册，运行时查询。
 */
export interface SkillRegistry {
	/** 注册一个 skill 入口（同名覆盖） */
	register(entry: SkillEntry): void;
	/** 获取所有已注册 skill 的元数据（用于 system prompt 注入） */
	listMetadata(): readonly SkillMetadata[];
	/** 按名称查找元数据 */
	getMetadata(name: string): SkillMetadata | undefined;
	/** 按名称查找完整入口信息（含路径） */
	get(name: string): SkillEntry | undefined;
	/** 列出所有已注册 skill 入口 */
	list(): readonly SkillEntry[];
}
