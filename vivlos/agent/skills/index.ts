export * from "./types.ts";
export * from "./registry.ts";

import type { SkillEntry } from "./types.ts";

/**
 * 将 skill 列表格式化为 system prompt 中的 skills 块。
 *
 * 采用 XML 格式（参照 pi-agent-core / agentskills.io 规范），
 * 包含 name + description + location（文件路径）。
 *
 * LLM 看到匹配的 skill 时，用 read 工具读取 location 指向的 SKILL.md 文件，
 * 获取完整的执行流程 SOP。
 */
export function formatSkillsForPrompt(skills: readonly SkillEntry[]): string {
	if (skills.length === 0) return "";

	const lines = [
		"The following skills provide specialized instructions for specific tasks.",
		"Read the full skill file (use the read tool) when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory.",
		"",
		"<available_skills>",
	];

	for (const skill of skills) {
		const desc = skill.metadata.description.replace(/\n/g, " ").trim();
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(skill.metadata.name)}</name>`);
		lines.push(`    <description>${escapeXml(desc)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}

	lines.push("</available_skills>");
	return lines.join("\n");
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
