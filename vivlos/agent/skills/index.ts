export * from "./types.ts";
export * from "./registry.ts";

import type { SkillEntry } from "./types.ts";

/**
 * 将 skill 列表格式化为 <skill> 条目列表（纯数据）。
 *
 * 不含 <available_skills> 包裹标签（由 builder 负责）
 * 不含指令文本（由 rules.md 负责）
 *
 * 只输出 name + description + location。
 */
export function formatSkillsForPrompt(skills: readonly SkillEntry[]): string {
	if (skills.length === 0) return "";

	const lines: string[] = [];
	for (const skill of skills) {
		const desc = skill.metadata.description.replace(/\n/g, " ").trim();
		lines.push("<skill>");
		lines.push(`  <name>${escapeXml(skill.metadata.name)}</name>`);
		lines.push(`  <description>${escapeXml(desc)}</description>`);
		lines.push(`  <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("</skill>");
	}

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
