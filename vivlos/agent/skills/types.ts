/**
 * Skill 系统类型定义。
 *
 * 设计基于渐进式披露（progressive disclosure）三层架构：
 *
 *   第一层 - metadata（始终在 system prompt 中）
 *     仅 name + description，LLM 据此做意图匹配。
 *     开销极小（每个 skill ~100 chars）。
 *
 *   第二层 - SKILL.md 正文（skill 激活时加载）
 *     完整的执行流程 SOP、决策树、自查清单。
 *     由 SkillLoader.load() 按需读取，注入到当前对话上下文。
 *
 *   第三层 - references/（skill 激活后按需加载）
 *     补充资料（新闻源列表、格式模板等）。
 *     由 SkillLoader.loadReference() 逐文件加载，仅在 LLM 需要时。
 *
 * Skill 专属工具（scripts/）在 skill 激活时注册为 AgentTool，
 * 未激活时不注册，以节省 system prompt 中的 tool description token。
 *
 * 通用工具（如 read/write/bash）放在 tools/builtin/，始终注册。
 * skill 可通过 allowed-tools 声明工具权限白名单，激活时限制可用工具范围。
 */

/** Skill 来源类型 */
export type SkillSource = "builtin" | "extension";

// ── 元数据 ──

/**
 * Skill 元数据 -- 从 SKILL.md 的 YAML frontmatter 解析。
 *
 * 渐进式披露第一层：始终存在于 system prompt 中。
 * LLM 根据 name + description 做意图匹配，决定是否激活 skill。
 *
 * frontmatter 格式：
 * ```yaml
 * ---
 * name: ai-daily
 * description: "生成 AI 领域日报..."
 * version: "1.0.0"
 * allowed-tools:
 *   - Bash(tvly *)
 *   - Read
 * ---
 * ```
 */
export interface SkillMetadata {
	/** skill 唯一标识（kebab-case） */
	readonly name: string;
	/**
	 * 简短描述：何时使用此 skill。
	 * LLM 据此做意图匹配，需明确触发条件和反触发条件。
	 */
	readonly description: string;
	/** 可选版本号 */
	readonly version?: string;
	/**
	 * 工具权限白名单。
	 * 仅在 skill 激活时生效，限制可用工具范围。
	 * 格式：`ToolName` 或 `ToolName(pattern)`。
	 * - `Bash(tvly *)` -- bash 工具，仅允许 tvly 开头的命令
	 * - `Bash` -- bash 工具，无限制
	 * - `Read` -- read 工具
	 * 不声明时表示不限制（所有已注册工具可用）。
	 */
	readonly allowedTools?: readonly string[];
}

// ── 完整 Skill ──

/**
 * Skill 完整定义 -- 按需加载后组装。
 *
 * metadata 始终在 system prompt（第一层）；
 * content 在 skill 激活时加载（第二层）；
 * references 在 skill 激活后按需加载（第三层）。
 */
export interface Skill {
	/** 元数据（frontmatter 解析结果） */
	readonly metadata: SkillMetadata;
	/** SKILL.md 正文（Markdown SOP，frontmatter 之后的部分） */
	readonly content: string;
	/** skill 目录的绝对路径（用于解析 references/ 和 scripts/） */
	readonly dir: string;
	/** SKILL.md 文件的绝对路径 */
	readonly filePath: string;
}

// ── 注册表 ──

/**
 * Skill 注册项 -- 注册表内部存储单元。
 *
 * 只含 metadata + 路径信息（轻量），
 * content 由 SkillLoader 按需加载。
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
 *
 * 职责：
 * - 启动时扫描 builtin/ + extension/ 目录，解析每个 SKILL.md 的 frontmatter
 * - 存储 metadata + 路径信息（不加载正文）
 * - 提供 listMetadata() 供 prompt builder 注入 system prompt
 * - 提供 get() 供 SkillLoader 查找路径后按需加载
 */
export interface SkillRegistry {
	/** 注册一个 skill 入口（同名覆盖） */
	register(entry: SkillEntry): void;
	/** 获取所有已注册 skill 的元数据（用于 system prompt 注入） */
	listMetadata(): readonly SkillMetadata[];
	/** 按名称查找元数据 */
	getMetadata(name: string): SkillMetadata | undefined;
	/** 按名称查找完整入口信息（含路径，供 Loader 使用） */
	get(name: string): SkillEntry | undefined;
	/** 列出所有已注册 skill 入口 */
	list(): readonly SkillEntry[];
}

// ── 加载器 ──

/**
 * Skill 加载器 -- 按需加载 SKILL.md 正文和 references/ 文件。
 *
 * 渐进式披露第二、三层：
 * - load(): 加载 SKILL.md 正文，返回完整 Skill（第二层）
 * - loadReference(): 加载 references/ 下的指定文件（第三层）
 * - listReferences(): 列出 references/ 下可用文件（供 LLM 选择）
 *
 * 依赖 SkillRegistry 查找 skill 目录路径。
 */
export interface SkillLoader {
	/**
	 * 加载完整 skill（metadata + content）。
	 * 从 registry 查找路径，读取 SKILL.md 正文（跳过 frontmatter）。
	 */
	load(name: string): Promise<Skill | undefined>;
	/** 列出 skill 的 references/ 目录下可用文件名 */
	listReferences(name: string): Promise<readonly string[]>;
	/**
	 * 加载 references/ 下的指定文件内容。
	 * @param name skill 名称
	 * @param refName 文件名（含扩展名，如 "sources.md"）
	 */
	loadReference(name: string, refName: string): Promise<string | undefined>;
}
