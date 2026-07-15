import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

import type { SkillMetadata, SkillEntry, SkillRegistry } from "./types.ts";
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
 */
function validateMetadata(raw: Record<string, unknown>): SkillMetadata | null {
	const name = raw["name"];
	const description = raw["description"];

	if (typeof name !== "string" || name.trim() === "") return null;
	if (typeof description !== "string" || description.trim() === "") return null;

	const version = raw["version"];
	const tools = raw["tools"];

	return {
		name: name.trim(),
		description: description.trim(),
		version: typeof version === "string" ? version : undefined,
		tools: Array.isArray(tools)
			? tools.filter((t): t is string => typeof t === "string")
			: undefined,
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
 * 约定：每个 skill 是 dir 下的一个子目录，子目录内含 SKILL.md。
 * ```
 *   builtin/
 *     ai-daily/
 *       SKILL.md
 *       references/
 *       scripts/
 * ```
 *
 * 解析失败的 skill 会被跳过并 log warn，不会中断扫描。
 *
 * @param dir 要扫描的目录（如 builtin/）
 * @param registry 可选，不传则创建新 registry
 * @returns registry
 */
export function scanSkillsDir(
	dir: string,
	registry?: SkillRegistry,
): SkillRegistry {
	const reg = registry ?? createSkillRegistry();
	const absDir = resolve(dir);

	let names: string[];
	try {
		names = readdirSync(absDir);
	} catch (err) {
		log(
			"warn",
			`scanSkillsDir: 无法读取目录 ${absDir}: ${err instanceof Error ? err.message : String(err)}`,
		);
		return reg;
	}

	for (const name of names) {
		// ———— 查找 SKILL.md 路径 ————
		const skillDir = join(absDir, name);

		let stat;
		try {
			stat = statSync(skillDir);
		} catch {
			continue;
		}
		if (!stat.isDirectory()) continue;

		const skillFile = join(skillDir, "SKILL.md");
		if (!existsSync(skillFile)) continue;

		// ———— SKILL.md 注册准备 ————
		try {
			// 1. 读取
			const raw = readFileSync(skillFile, "utf-8");

			// 2. 解析
			const parsed = parseSkillFile(raw);
			if (!parsed) {
				log("warn", `scanSkillsDir: ${skillFile} frontmatter 解析失败，跳过`);
				continue;
			}

			// 3. 校验
			const metadata = validateMetadata(parsed.metadata);
			if (!metadata) {
				log(
					"warn",
					`scanSkillsDir: ${skillFile} metadata 校验失败（name/description 缺失），跳过`,
				);
				continue;
			}

			// 4. 注册
			reg.register({ metadata, dir: skillDir, filePath: skillFile });
		} catch (err) {
			log(
				"warn",
				`scanSkillsDir: 读取 ${skillFile} 失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	return reg;
}
