import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SkillRegistry } from "@vivlos/agent/skills/types.ts";
import { parseSkillFile } from "@vivlos/agent/skills/registry.ts";
import { ToolError } from "@vivlos/shared/errors.ts";

const Params = Type.Object({
	name: Type.String({ description: "要激活的 skill 名称" }),
	reference: Type.Optional(
		Type.String({
			description:
				"references/ 下的文件名。必须先加载 skill 正文后才能加载 reference",
		}),
	),
});

type Params = Static<typeof Params>;

interface SkillToolDetails {
	message: string;
	layer: "content" | "reference";
}

/**
 * 创建 skill 工具。
 *
 * 渐进式披露两层（第一层 metadata 在 system prompt 中）：
 *
 * 1. skill({ name })            -> 返回 SKILL.md 正文 + references 列表
 * 2. skill({ name, reference }) -> 返回指定 reference 文件内容
 *
 * 必须先执行步骤 1 加载正文，才能执行步骤 2 加载 reference。
 * 工具内部用 Set 跟踪已加载正文的 skill。
 *
 * 工具自包含文件读取，不依赖 read 工具。
 */
export function createSkillTool(
	skillRegistry: SkillRegistry,
): AgentTool<typeof Params, SkillToolDetails> {
	/** 已加载正文的 skill 名称集合 */
	const loadedSkills = new Set<string>();

	return {
		name: "skill",
		description:
			"激活 skill 获取完整指引。使用方式：第一步 skill({ name }) 加载 SKILL.md 正文和 references 列表；第二步 skill({ name, reference }) 加载指定 reference 文件。必须先加载正文才能加载 reference。",
		label: "激活 Skill",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<SkillToolDetails>> {
			try {
				const entry = skillRegistry.get(params.name);
				if (!entry) {
					return {
						content: [
							{
								type: "text",
								text: `Skill "${params.name}" not found. Available skills: ${skillRegistry
									.listMetadata()
									.map((s) => s.name)
									.join(", ")}`,
							},
						],
						details: {
							message: `skill not found: ${params.name}`,
							layer: "content",
						},
					};
				}

				// ── 第三层：加载 reference 文件 ──
				if (params.reference) {
					if (!loadedSkills.has(params.name)) {
						return {
							content: [
								{
									type: "text",
									text: `必须先用 skill({ name: "${params.name}" }) 加载 skill 正文，才能加载 reference。`,
								},
							],
							details: {
								message: `reference blocked (content not loaded): ${params.name}`,
								layer: "reference",
							},
						};
					}

					const refPath = join(entry.dir, "references", params.reference);
					if (!existsSync(refPath)) {
						return {
							content: [
								{
									type: "text",
									text: `Reference "${params.reference}" not found in skill "${params.name}". Available: ${listReferenceFiles(entry.dir).join(", ") || "(none)"}`,
								},
							],
							details: {
								message: `reference not found: ${params.reference}`,
								layer: "reference",
							},
						};
					}
					const content = readFileSync(refPath, "utf-8");
					return {
						content: [{ type: "text", text: content }],
						details: {
							message: `loaded reference: ${params.name}/${params.reference}`,
							layer: "reference",
						},
					};
				}

				// ── 第二层：返回 SKILL.md 正文 + references 列表 ──
				const raw = readFileSync(entry.filePath, "utf-8");
				const parsed = parseSkillFile(raw);
				if (!parsed) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to parse SKILL.md for skill "${params.name}".`,
							},
						],
						details: {
							message: `parse failed: ${params.name}`,
							layer: "content",
						},
					};
				}

				loadedSkills.add(params.name);

				const refs = listReferenceFiles(entry.dir);
				const refsSection =
					refs.length > 0
						? `\n\n## Available references\n${refs.map((r) => `- ${r}`).join("\n")}\n\nUse skill({ name: "${params.name}", reference: "filename" }) to load a reference.`
						: "";

				const text = `<skill name="${entry.metadata.name}" location="${entry.filePath}">\nReferences are relative to ${entry.dir}.\n\n${parsed.content}${refsSection}\n</skill>`;

				return {
					content: [{ type: "text", text }],
					details: {
						message: `loaded skill: ${params.name} (${parsed.content.length} chars)`,
						layer: "content",
					},
				};
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "skill", cause);
			}
		},
	};
}

/**
 * 列出 skill 目录下 references/ 中的文件名。
 */
function listReferenceFiles(skillDir: string): string[] {
	const refsDir = join(skillDir, "references");
	if (!existsSync(refsDir)) return [];
	try {
		if (!statSync(refsDir).isDirectory()) return [];
		return readdirSync(refsDir).filter((f) => {
			try {
				return statSync(join(refsDir, f)).isFile();
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
}
