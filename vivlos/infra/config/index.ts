import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getVivlosDir } from "../paths.ts";
import type { ModelRef } from "../llm/types.ts";

export type { ModelRef } from "../llm/types.ts";

// #region ToolConfig

export interface ToolConfig {
	/** bash 命令权限规则，key=通配符模式，value=allow|deny，按顺序匹配最后命中生效 */
	bash: Record<string, "allow" | "deny">;
}

// #endregion

// #region RetryConfig

export interface RetryConfig {
	/** 是否自动重试瞬时 Provider/网络错误 */
	enabled: boolean;
	/** Agent Session 级最大重试次数，0 表示不重试 */
	maxRetries: number;
	/** 指数退避基础时间，实际为 baseDelayMs * 2^(attempt - 1) */
	baseDelayMs: number;
}

// #endregion

// #region CompressionConfig

export interface CompressionConfig {
	/** 触发压缩的 token 比例（contextWindow 的百分比），默认 0.5 */
	threshold: number;
	/** tail 保留预算比例（触发阈值 token × 此值），默认 0.2 */
	targetRatio: number;
	/** tail 至少保留的消息条数，默认 20 */
	protectLastN: number;
	/** 压缩用的模型 provider/modelId，null = 用当前对话模型 */
	model: string | null;
	/** 防抖：连续无效压缩达到此值时暂停自动触发，默认 2 */
	maxConsecutiveNoOp: number;
}

// #endregion

// #region MemoryConfig

export interface ConsolidatorConfig {
	/** null 表示每次运行使用当时的当前主模型 */
	model: ModelRef | null;
	trigger: {
		/** 主模型 committed Memory 操作数量阈值 */
		operations: number;
		/** memory/user 字符容量触发比例 */
		capacity: number;
	};
	maxTurns: number;
	maxTools: number;
	timeoutMs: number;
}

export interface MemoryConfig {
	/** Markdown 记忆文件的字符上限 */
	characterLimit: {
		memory: number;
		user: number;
	};
	consolidator: ConsolidatorConfig;
}

// #endregion

// #region VivlosConfig

export interface VivlosConfig {
	tool: ToolConfig;
	retry: RetryConfig;
	compression: CompressionConfig;
	memory: MemoryConfig;
}

const DEFAULT_CONFIG: VivlosConfig = {
	tool: {
		bash: {
			"rm -rf /*": "deny",
			"*": "allow",
		},
	},
	retry: {
		enabled: true,
		maxRetries: 3,
		baseDelayMs: 2000,
	},
	compression: {
		threshold: 0.5,
		targetRatio: 0.2,
		protectLastN: 20,
		model: null,
		maxConsecutiveNoOp: 2,
	},
	memory: {
		characterLimit: {
			memory: 2200,
			user: 1375,
		},
		consolidator: {
			model: null,
			trigger: {
				operations: 20,
				capacity: 0.85,
			},
			maxTurns: 6,
			maxTools: 8,
			timeoutMs: 60_000,
		},
	},
};

// #endregion

// #region 配置加载

/** 获取 config.json 路径 */
export function getConfigPath(): string {
	return resolve(getVivlosDir(), "config.json");
}

/**
 * 加载配置：读取 .vivlos/config.json，不存在或解析失败则返回默认值。
 * 逐字段合并：用户配置覆盖默认值，未指定的字段保留默认。
 */
export function loadConfig(): VivlosConfig {
	const filePath = getConfigPath();
	if (!existsSync(filePath)) return DEFAULT_CONFIG;
	try {
		const raw = readFileSync(filePath, "utf-8");
		const userConfig = JSON.parse(raw) as Partial<VivlosConfig>;
		const userMemoryLimits = userConfig.memory?.characterLimit;
		const userConsolidator = userConfig.memory?.consolidator;
		const defaults = DEFAULT_CONFIG.memory.consolidator;
		return {
			tool: {
				bash: { ...DEFAULT_CONFIG.tool.bash, ...userConfig.tool?.bash },
			},
			retry: {
				enabled: typeof userConfig.retry?.enabled === "boolean"
					? userConfig.retry.enabled
					: DEFAULT_CONFIG.retry.enabled,
				maxRetries: nonNegativeInteger(
					userConfig.retry?.maxRetries,
					DEFAULT_CONFIG.retry.maxRetries,
				),
				baseDelayMs: positiveInteger(
					userConfig.retry?.baseDelayMs,
					DEFAULT_CONFIG.retry.baseDelayMs,
				),
			},
			compression: { ...DEFAULT_CONFIG.compression, ...userConfig.compression },
			memory: {
				characterLimit: {
					memory: positiveInteger(
						userMemoryLimits?.memory,
						DEFAULT_CONFIG.memory.characterLimit.memory,
					),
					user: positiveInteger(
						userMemoryLimits?.user,
						DEFAULT_CONFIG.memory.characterLimit.user,
					),
				},
				consolidator: {
					model: modelRef(userConsolidator?.model),
					trigger: {
						operations: positiveInteger(
							userConsolidator?.trigger?.operations,
							defaults.trigger.operations,
						),
						capacity: ratio(
							userConsolidator?.trigger?.capacity,
							defaults.trigger.capacity,
						),
					},
					maxTurns: positiveInteger(
						userConsolidator?.maxTurns,
						defaults.maxTurns,
					),
					maxTools: positiveInteger(
						userConsolidator?.maxTools,
						defaults.maxTools,
					),
					timeoutMs: positiveInteger(
						userConsolidator?.timeoutMs,
						defaults.timeoutMs,
					),
				},
			},
		};
	} catch {
		return DEFAULT_CONFIG;
	}
}

/** 配置值必须是正整数，否则回退默认值 */
function positiveInteger(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0
		? value
		: fallback;
}

/** 配置值必须是非负整数，否则回退默认值 */
function nonNegativeInteger(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0
		? value
		: fallback;
}

function ratio(value: unknown, fallback: number): number {
	return typeof value === "number" && value > 0 && value <= 1
		? value
		: fallback;
}

function modelRef(value: unknown): ModelRef | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const model = value as Record<string, unknown>;
	if (
		typeof model.provider !== "string" ||
		!model.provider.trim() ||
		typeof model.id !== "string" ||
		!model.id.trim()
	) {
		return null;
	}
	return { provider: model.provider.trim(), id: model.id.trim() };
}

/** 确保 config.json 存在，不存在则生成默认配置 */
export function ensureConfig(): void {
	const filePath = getConfigPath();
	if (!existsSync(filePath)) {
		writeFileSync(
			filePath,
			JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n",
			"utf-8",
		);
	}
}
