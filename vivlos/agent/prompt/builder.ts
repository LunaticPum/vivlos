import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { PromptBuilder, PromptBuilderOptions } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "templates");

/**
 * 从 templates/ 目录加载 MD 文件。
 * 失败时返回 fallback，确保系统可启动。
 */
function loadTemplate(name: string, fallback: string): string {
	try {
		return readFileSync(resolve(TEMPLATES_DIR, name), "utf-8").trim();
	} catch {
		return fallback;
	}
}

/**
 * 替换模板中的 {{placeholder}} 占位符。
 */
function substitute(template: string, values: Record<string, string>): string {
	return template.replace(
		/\{\{(\w+)\}\}/g,
		(_, key: string) => values[key] ?? "",
	);
}

/**
 * 生成 environment 占位符的动态值。
 * 每次 build() 时调用，确保时间实时更新。
 */
function getEnvironmentValues(): Record<string, string> {
	const now = new Date();
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const bunVersion = (process.versions as Record<string, string>).bun;

	return {
		runtime: bunVersion ? `Bun ${bunVersion}` : `Node.js ${process.version}`,
		os: process.platform,
		cwd: process.cwd(),
		timezone,
		time: now.toISOString(),
		language: "zh-CN",
	};
}

/**
 * 将内容包裹在 XML 标签中，内容每行加 tab 缩进。
 */
function wrapXml(tag: string, content: string): string {
	const indented = content
		.split("\n")
		.map((line) => (line ? `\t${line}` : line))
		.join("\n");
	return `<${tag}>\n${indented}\n</${tag}>`;
}

/**
 * 创建 system prompt 组装器。
 *
 * 段落顺序（全 XML 格式）：
 *   <identity> -> <environment> -> <available_skills> -> <memory> -> <rules>
 *
 * identity / environment / rules 从 templates/ 目录加载 MD 文件。
 * environment 带 {{placeholder}} 占位符，build() 时动态替换。
 * skills 由 formatSkillsForPrompt() 生成 <skill> 条目，builder 包裹 <available_skills>。
 * memory 由 agent-loop 注入。
 */
export function createPromptBuilder(
	options: PromptBuilderOptions = {},
): PromptBuilder {
	const identityTpl =
		options.identity ??
		loadTemplate("identity.md", "你是 vivlos，一个个人 AI 助手。");
	const environmentTpl = loadTemplate(
		"environment.md",
		"<runtime>{{runtime}}</runtime>",
	);
	const rulesTpl = options.rules ?? loadTemplate("rules.md", "- 回答简洁直接");

	let memoryText: string | undefined;
	let skillsText: string | undefined;
	let compactedHistoryText: string | undefined;
	let cachedSP: string | undefined;

	const doBuild = (): string => {
		const sections: string[] = [];

		sections.push(wrapXml("identity", identityTpl));

		const envContent = substitute(environmentTpl, getEnvironmentValues());
		sections.push(wrapXml("environment", envContent));

		if (skillsText) sections.push(wrapXml("available_skills", skillsText));
		if (memoryText) sections.push(wrapXml("memory", memoryText));
		if (compactedHistoryText)
			sections.push(wrapXml("compacted_history", compactedHistoryText));

		sections.push(wrapXml("rules", rulesTpl));

		return sections.join("\n\n");
	};

	return {
		build() {
			return doBuild();
		},
		setMemory(text: string) {
			memoryText = text;
			cachedSP = undefined;
		},
		setSkills(text: string) {
			skillsText = text;
			cachedSP = undefined;
		},
		setCompactedHistory(text: string) {
			compactedHistoryText = text;
			cachedSP = undefined;
		},
		freeze() {
			cachedSP = doBuild();
		},
		getCached() {
			if (cachedSP === undefined) cachedSP = doBuild();
			return cachedSP;
		},
		isFrozen() {
			return cachedSP !== undefined;
		},
		invalidate() {
			cachedSP = undefined;
		},
	};
}
