import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import type { SkillLoader, SkillRegistry } from "./types.ts";
import { parseSkillFile } from "./registry.ts";
import { log } from "@vivlos/infra/logger/index.ts";

/**
 * 创建 SkillLoader。
 *
 * 依赖 SkillRegistry 查找 skill 目录路径，
 * 按需读取 SKILL.md 正文和 references/ 文件。
 *
 * 渐进式披露：
 * - load(): 第二层，读取 SKILL.md 正文
 * - loadReference() / listReferences(): 第三层，读取 references/ 文件
 *
 * metadata 始终取自 registry（与 system prompt 中一致），
 * content 从文件实时读取（保证最新）。
 */
export function createSkillLoader(registry: SkillRegistry): SkillLoader {
	return {
		async load(name) {
			// 1. 先查注册表
			const entry = registry.get(name);
			if (!entry) return undefined;

			try {
				const raw = readFileSync(entry.filePath, "utf-8");
				const parsed = parseSkillFile(raw);
				if (!parsed) {
					log("warn", `SkillLoader.load: ${entry.filePath} 解析失败`);
					return undefined;
				}

				return {
					metadata: entry.metadata,
					content: parsed.content,
					dir: entry.dir,
					filePath: entry.filePath,
				};
			} catch (err) {
				log(
					"warn",
					`SkillLoader.load: 读取 ${entry.filePath} 失败: ${err instanceof Error ? err.message : String(err)}`,
				);
				return undefined;
			}
		},

		async listReferences(name) {
			const entry = registry.get(name);
			if (!entry) return [];

			const refsDir = join(entry.dir, "references");
			if (!existsSync(refsDir)) return [];

			try {
				const stat = statSync(refsDir);
				if (!stat.isDirectory()) return [];

				return readdirSync(refsDir).filter((f) => {
					try {
						return statSync(join(refsDir, f)).isFile();
					} catch {
						return false;
					}
				});
			} catch (err) {
				log(
					"warn",
					`SkillLoader.listReferences: 读取 ${refsDir} 失败: ${err instanceof Error ? err.message : String(err)}`,
				);
				return [];
			}
		},

		async loadReference(name, refName) {
			const entry = registry.get(name);
			if (!entry) return undefined;

			const refPath = join(entry.dir, "references", refName);
			try {
				return readFileSync(refPath, "utf-8");
			} catch (err) {
				log(
					"warn",
					`SkillLoader.loadReference: 读取 ${refPath} 失败: ${err instanceof Error ? err.message : String(err)}`,
				);
				return undefined;
			}
		},
	};
}
