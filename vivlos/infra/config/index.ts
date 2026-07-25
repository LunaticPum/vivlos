import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getVivlosDir } from "../paths.ts";

// #region ToolConfig

export interface ToolConfig {
	/** bash 命令权限规则，key=通配符模式，value=allow|deny，按顺序匹配最后命中生效 */
	bash: Record<string, "allow" | "deny">;
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

export interface MemoryConfig {
	/** Markdown 记忆文件的字符上限 */
	characterLimit: {
		memory: number;
		user: number;
	};
}

// #endregion

// #region VivlosConfig

export interface VivlosConfig {
	tool: ToolConfig;
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
		return {
			tool: {
				bash: { ...DEFAULT_CONFIG.tool.bash, ...userConfig.tool?.bash },
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
