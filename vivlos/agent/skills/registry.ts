import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import type {
	SkillMetadata,
	SkillEntry,
	SkillRegistry,
	SkillSource,
} from "./types.ts";
import { log } from "@vivlos/infra/logger/index.ts";

// ── Frontmatter 解析 ──

const FRONTMATTER_DELIMITER = "---";

/**
 * 从 SKILL.md 文本中解析 YAML frontmatter 和正文。
 *
 * frontmatter 格式：
 * ```
 * ---
 * name: skill-name
 * description: "描述"
 * tools:
 *   - tool-a
 * ---
 * ```
 *
 * @returns metadata 原始键值对 + frontmatter 之后的 Markdown 正文；解析失败返回 null
 */
export function parseSkillFile(raw: string): {
	metadata: Record<string, unknown>;
	content: string;
} | null {
	const lines = raw.split("\n");

	if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
		return null;
	}

	let endLine = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === FRONTMATTER_DELIMITER) {
			endLine = i;
			break;
		}
	}

	if (endLine === -1) {
		return null;
	}

	const yamlText = lines.slice(1, endLine).join("\n");
	const content = lines
		.slice(endLine + 1)
		.join("\n")
		.trimStart();

	let metadata: Record<string, unknown>;
	try {
		const parsed = parseYaml(yamlText);
		metadata =
			parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: {};
	} catch {
		return null;
	}

	return { metadata, content };
}

// ── Metadata 校验 ──

/**
 * 将解析出的 raw metadata 校验并转为 SkillMetadata。
 * name 和 description 必填，缺失则返回 null。
 *
 * allowed-tools 支持 string（单个）和 list（多个）两种格式。
 */
function validateMetadata(raw: Record<string, unknown>): SkillMetadata | null {
	const name = raw["name"];
	const description = raw["description"];

	if (typeof name !== "string" || name.trim() === "") return null;
	if (typeof description !== "string" || description.trim() === "") return null;

	const version = raw["version"];
	const allowedToolsRaw = raw["allowed-tools"];

	let allowedTools: string[] | undefined;
	if (typeof allowedToolsRaw === "string") {
		allowedTools = [allowedToolsRaw];
	} else if (Array.isArray(allowedToolsRaw)) {
		allowedTools = allowedToolsRaw.filter(
			(t): t is string => typeof t === "string",
		);
		if (allowedTools.length === 0) allowedTools = undefined;
	}

	return {
		name: name.trim(),
		description: description.trim(),
		version: typeof version === "string" ? version : undefined,
		allowedTools,
	};
}

// ── 注册表工厂 ──

/**
 * 创建内存 SkillRegistry。
 *
 * register/listMetadata/getMetadata/get/list 五个操作，
 * 启动时由 scanSkillsDir 填充，运行时由 prompt builder / loader 查询。
 */
export function createSkillRegistry(): SkillRegistry {
	const entries = new Map<string, SkillEntry>();

	return {
		register(entry) {
			entries.set(entry.metadata.name, entry);
		},
		listMetadata() {
			return [...entries.values()].map((e) => e.metadata);
		},
		getMetadata(name) {
			return entries.get(name)?.metadata;
		},
		get(name) {
			return entries.get(name);
		},
		list() {
			return [...entries.values()];
		},
	};
}

// ── 目录扫描 ──

/**
 * 扫描目录下的所有 skill 子目录，解析 SKILL.md frontmatter，注册到 registry。
 *
 * 递归扫描：如果子目录没有 SKILL.md，继续往下一层找。
 * 支持两种目录结构：
 * ```
 *   builtin/                    # 自研 skill（扁平）
 *     ai-daily/
 *       SKILL.md
 *
 *   extension/                  # 第三方 skill（带 vendor 层）
 *     tavily/
 *       tavily-search/
 *         SKILL.md
 * ```
 *
 * 解析失败的 skill 会被跳过并 log warn，不会中断扫描。
 *
 * @param dir 要扫描的目录
 * @param source 来源标记（builtin / extension）
 * @param registry 可选，不传则创建新 registry
 * @returns registry
 */
export function scanSkillsDir(
	dir: string,
	source: SkillSource = "builtin",
	registry?: SkillRegistry,
): SkillRegistry {
	const reg = registry ?? createSkillRegistry();
	scanRecursive(resolve(dir), source, reg);
	return reg;
}

function scanRecursive(
	absDir: string,
	source: SkillSource,
	reg: SkillRegistry,
): void {
	let names: string[];
	try {
		names = readdirSync(absDir);
	} catch {
		return;
	}

	for (const name of names) {
		const itemPath = join(absDir, name);

		let stat;
		try {
			stat = statSync(itemPath);
		} catch {
			continue;
		}
		if (!stat.isDirectory()) continue;

		const skillFile = join(itemPath, "SKILL.md");
		if (!existsSync(skillFile)) {
			scanRecursive(itemPath, source, reg);
			continue;
		}

		try {
			const raw = readFileSync(skillFile, "utf-8");
			const parsed = parseSkillFile(raw);
			if (!parsed) {
				log("warn", `scanSkillsDir: ${skillFile} frontmatter 解析失败，跳过`);
				continue;
			}

			const metadata = validateMetadata(parsed.metadata);
			if (!metadata) {
				log(
					"warn",
					`scanSkillsDir: ${skillFile} metadata 校验失败（name/description 缺失），跳过`,
				);
				continue;
			}

			reg.register({ metadata, dir: itemPath, filePath: skillFile, source });
		} catch (err) {
			log(
				"warn",
				`scanSkillsDir: 读取 ${skillFile} 失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}
