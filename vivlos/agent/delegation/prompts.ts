/**
 * 子 agent 的系统提示词与任务移交包构建。
 *
 * SP = 类别模板 + 极简环境块（不继承主会话 identity/rules/memory）；
 * 首条消息 = 结构化 task_brief（目标/细节/背景/参考资料路径）。
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Message } from "@earendil-works/pi-ai";

import type { DelegationTaskSpec, TaskKind } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "../prompt/templates");

const KIND_TEMPLATE: Record<TaskKind, string> = {
	exploring: "subagent-exploring.md",
	writing: "subagent-writing.md",
};

/** 构建子 agent 系统提示词：类别模板 + 环境块。 */
export function buildSubagentSystemPrompt(kind: TaskKind): string {
	const template = readFileSync(
		resolve(TEMPLATES_DIR, KIND_TEMPLATE[kind]),
		"utf-8",
	).trim();
	return `${template}\n\n${environmentBlock()}`;
}

/** 构建子 agent 的首条消息（结构化任务移交包）。 */
export function buildTaskBrief(spec: DelegationTaskSpec): string {
	const lines = [
		"<task_brief>",
		`\t<goal>${escapeXml(spec.title)}</goal>`,
		`\t<details>${escapeXml(spec.brief)}</details>`,
	];
	if (spec.context?.trim()) {
		lines.push(`\t<context>${escapeXml(spec.context)}</context>`);
	}
	if (spec.references?.length) {
		lines.push("\t<references>");
		for (const ref of spec.references) {
			lines.push(`\t\t<ref>${escapeXml(ref)}</ref>`);
		}
		lines.push("\t</references>");
	}
	lines.push("</task_brief>");
	return lines.join("\n");
}

/** 构建子 agent 的首条 user 消息（runner 与钻取视图共用，保证一致）。 */
export function buildBriefUserMessage(spec: DelegationTaskSpec): Message {
	return {
		role: "user",
		content: [{ type: "text", text: buildTaskBrief(spec) }],
		timestamp: Date.now(),
	};
}

function environmentBlock(): string {
	const bunVersion = (process.versions as Record<string, string>).bun;
	const runtime = bunVersion ? `Bun ${bunVersion}` : `Node.js ${process.version}`;
	return [
		"<environment>",
		`\t<runtime>${runtime}</runtime>`,
		`\t<os>${process.platform}</os>`,
		`\t<cwd>${process.cwd()}</cwd>`,
		`\t<time>${new Date().toISOString()}</time>`,
		"</environment>",
	].join("\n");
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
