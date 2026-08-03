import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import {
	readFileSync,
	readdirSync,
	existsSync,
	realpathSync,
	statSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SkillRegistry } from "@vivlos/agent/skills/index.ts";
import { parseSkillFile } from "@vivlos/agent/skills/index.ts";
import { ToolError } from "@vivlos/shared/errors.ts";

const Params = Type.Object(
	{
		name: Type.String({ description: "Registered Skill name" }),
		reference: Type.Optional(
			Type.String({ description: "Declared reference file" }),
		),
	},
	{ additionalProperties: false },
);

type Params = Static<typeof Params>;

/** 兼容模型把任务 prompt 传给 Skill 指引加载器的已知偏差。 */
function prepareSkillArguments(args: unknown): Params {
	if (!isObject(args) || typeof args.name !== "string") {
		return args as Params;
	}

	const allowedKeys = new Set(["name", "reference", "prompt"]);
	if (!Object.keys(args).every((key) => allowedKeys.has(key))) {
		return args as Params;
	}
	if (args.prompt !== undefined && typeof args.prompt !== "string") {
		return args as Params;
	}
	if (args.reference !== undefined && typeof args.reference !== "string") {
		return args as Params;
	}

	return {
		name: args.name,
		...(args.reference === undefined ? {} : { reference: args.reference }),
	};
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface SkillToolDetails {
	message: string;
	layer: "content" | "reference";
}

/** skill 工具创建结果 */
export interface SkillToolHandle {
	/** AgentTool 实例 */
	tool: AgentTool<typeof Params, SkillToolDetails>;
	/** 重置已加载 skill 状态（会话清理时调用） */
	reset: () => void;
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
 *
 * @returns { tool, reset } -- tool 注册到 agent，reset 在会话清理时调用
 */
export function createSkillTool(
	skillRegistry: SkillRegistry,
): SkillToolHandle {
	/** 已加载正文的 skill 名称集合 */
	const loadedSkills = new Set<string>();

	const tool: AgentTool<typeof Params, SkillToolDetails> = {
		name: "skill",
		description:
			"加载已注册 Skill 的指引正文或 reference。这是指引加载器，不执行 Skill 任务，也不接收 prompt、query 或 task。",
		label: "加载 Skill",
		parameters: Params,
		prepareArguments: prepareSkillArguments,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<SkillToolDetails>> {
			try {
				const entry = skillRegistry.get(params.name);
				if (!entry) {
					throw new ToolError(
						`Skill "${params.name}" not found. Available skills: ${skillRegistry
							.listMetadata()
							.map((skill) => skill.name)
							.join(", ")}`,
						"skill",
					);
				}

				// ── 第三层：加载 reference 文件 ──
				if (params.reference) {
					if (!loadedSkills.has(params.name)) {
						throw new ToolError(
							`必须先加载 Skill "${params.name}" 的正文，才能加载 reference。`,
							"skill",
						);
					}

					const references = listReferenceFiles(entry.dir);
					if (!references.includes(params.reference)) {
						throw new ToolError(
							`Reference "${params.reference}" not found in Skill "${params.name}". Available: ${references.join(", ") || "(none)"}`,
							"skill",
						);
					}
					const refPath = resolveReferencePath(entry.dir, params.reference);
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
					throw new ToolError(
						`Failed to parse SKILL.md for Skill "${params.name}".`,
						"skill",
					);
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
				if (err instanceof ToolError) throw err;
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "skill", cause);
			}
		},
	};

	return {
		tool,
		reset: () => loadedSkills.clear(),
	};
}

/** 解析 reference 并确认其真实路径仍位于 references/ 目录内。 */
function resolveReferencePath(skillDir: string, reference: string): string {
	const skillRoot = realpathSync(skillDir);
	const referencesDir = realpathSync(join(skillRoot, "references"));
	if (!isPathInside(skillRoot, referencesDir)) {
		throw new ToolError("Skill references directory escapes the Skill root.", "skill");
	}
	const referencePath = realpathSync(resolve(referencesDir, reference));
	if (!isPathInside(referencesDir, referencePath)) {
		throw new ToolError("Reference path escapes the Skill references directory.", "skill");
	}
	return referencePath;
}

/** 判断 target 是否严格位于 root 内部。 */
function isPathInside(root: string, target: string): boolean {
	const relativePath = relative(root, target);
	return relativePath !== "" &&
		!isAbsolute(relativePath) &&
		relativePath !== ".." &&
		!relativePath.startsWith(`..${sep}`);
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
