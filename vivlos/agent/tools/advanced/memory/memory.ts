/**
 * memory tool -- L1 记忆管理（add / replace / remove）
 *
 * 参照 Hermes memory tool 设计（02-memory.md §1.4-1.5）：
 * - 无 read（内容已在 SP 中）
 * - substring 匹配定位条目，多条命中报错
 * - 写入前 Injection Scanning（防跨 session 持久 payload）
 * - Cap as Feature：超限报错逼策展，不静默截断
 * - Duplicate = Success No-op：LLM 爱 retry，静默去重
 *
 * 存储：~/.vivlos/memories/memory.md + user.md，条目间用 --- 分隔。
 */

import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { AdvancedToolDeps } from "../index.ts";
import { description } from "./description.ts";

/** 条目分隔符（用户指定 ---，替代 Hermes 的 §） */
const SEPARATOR = "\n---\n";

// #region 写入前安全扫描
//
// memory 条目会注入每个未来 session 的 SP，
// 恶意写入 = 跨 session 持久 payload，必须拦截。

/** prompt injection 常见模式 */
const INJECTION_PATTERNS: RegExp[] = [
	/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
	/you\s+are\s+now\s+/i,
	/disregard\s+(all\s+)?(previous|prior|above)/i,
	/system\s*:\s*/i,
	/\[INST\]|\[\/INST\]|<<SYS>>|<\|im_start\|>/i,
];

/** 凭证外泄模式（SSH key / API key / password 等） */
const CREDENTIAL_PATTERNS: RegExp[] = [
	/BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY/i,
	/\bsk-[a-zA-Z0-9]{20,}/,
	/\bapi[_-]?key\s*[:=]\s*\S+/i,
	/\bpassword\s*[:=]\s*\S+/i,
	/\bsecret\s*[:=]\s*\S+/i,
	/\bAKIA[0-9A-Z]{16}/,
];

/** 不可见 Unicode（零宽字符等，人眼审计看不到但 LLM 能读到） */
const INVISIBLE_UNICODE = /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/;

/** 扫描文本是否含恶意模式，命中返回拒绝原因，通过返回 null */
function scanInjection(text: string): string | null {
	for (const p of INJECTION_PATTERNS) {
		if (p.test(text)) return `写入被拒绝：检测到 prompt injection 模式 (${p.source})`;
	}
	for (const p of CREDENTIAL_PATTERNS) {
		if (p.test(text)) return `写入被拒绝：检测到凭证模式 (${p.source})`;
	}
	if (INVISIBLE_UNICODE.test(text)) return "写入被拒绝：检测到不可见 Unicode 字符";
	return null;
}

// #endregion

// #region 文件读写

/** 读取条目列表（按 --- 分隔，去空行） */
function readEntries(filePath: string): string[] {
	if (!existsSync(filePath)) return [];
	const raw = readFileSync(filePath, "utf-8").trim();
	if (!raw) return [];
	return raw.split(SEPARATOR).map((e) => e.trim()).filter((e) => e.length > 0);
}

/** 写入条目列表（--- 分隔，末尾换行） */
function writeEntries(filePath: string, entries: string[]): void {
	mkdirSync(resolve(filePath, ".."), { recursive: true });
	writeFileSync(filePath, entries.join(SEPARATOR) + "\n", "utf-8");
}

/** 获取文件当前字符数（用于 cap 检查） */
function fileLength(filePath: string): number {
	if (!existsSync(filePath)) return 0;
	return readFileSync(filePath, "utf-8").length;
}

// #endregion

const Params = Type.Object({
	action: Type.Union(
		[Type.Literal("add"), Type.Literal("replace"), Type.Literal("remove")],
		{ description: "操作类型" },
	),
	file: Type.Union(
		[Type.Literal("memory"), Type.Literal("user")],
		{ description: "目标文件：memory = 项目/环境笔记，user = 用户画像" },
	),
	content: Type.Optional(Type.String({ description: "要追加的内容（add 时必填）" })),
	old_text: Type.Optional(Type.String({ description: "要匹配的子串（replace/remove 时必填）" })),
	new_text: Type.Optional(Type.String({ description: "替换后的文本（replace 时必填）" })),
});

type Params = Static<typeof Params>;

export function createMemoryTool(deps: AdvancedToolDeps): AgentTool<typeof Params, { message: string }> {
	return {
		name: "memory",
		description,
		label: "记忆管理",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<{ message: string }>> {
			const fileName = params.file === "memory" ? "memory.md" : "user.md";
			const filePath = resolve(deps.memoriesDir, fileName);
			const cap = params.file === "memory" ? deps.memoryConfig.memoryCap : deps.memoryConfig.userCap;

			switch (params.action) {
				case "add": {
					if (!params.content) {
						return err("add 操作需要 content 参数");
					}
					// 写入前安全扫描
					const scanResult = scanInjection(params.content);
					if (scanResult) return err(scanResult);

					const entries = readEntries(filePath);
					// Duplicate = Success No-op：完全相同内容不重复插入
					if (entries.some((e) => e === params.content)) {
						return ok(`已存在（静默跳过）："${truncate(params.content)}"`);
					}
					// Cap as Feature：超限报错，逼 agent 先 remove 腾空间
					const currentLen = fileLength(filePath);
					const addedLen = (entries.length > 0 ? SEPARATOR.length : 0) + params.content.length;
					if (currentLen + addedLen > cap) {
						return err(`${fileName} 已达上限（${currentLen}/${cap} 字符）。请先 remove 已有条目腾出空间。`);
					}
					entries.push(params.content);
					writeEntries(filePath, entries);
					return ok(`已写入 ${fileName}："${truncate(params.content)}"`);
				}

				case "replace": {
					if (!params.old_text || params.new_text === undefined) {
						return err("replace 操作需要 old_text 和 new_text 参数");
					}
					// 对替换后的内容做安全扫描
					const scanResult = scanInjection(params.new_text);
					if (scanResult) return err(scanResult);

					const entries = readEntries(filePath);
					// substring 匹配定位条目
					const matches = entries.filter((e) => e.includes(params.old_text!));
					if (matches.length === 0) return err(`未找到匹配 "${truncate(params.old_text)}" 的条目`);
					if (matches.length > 1) return err(`"${truncate(params.old_text)}" 匹配了 ${matches.length} 条，请写得更具体`);

					// 条目内替换：old_text -> new_text
					const idx = entries.indexOf(matches[0]!);
					entries[idx] = entries[idx]!.replace(params.old_text, params.new_text);
					writeEntries(filePath, entries);
					return ok(`已替换 ${fileName} 中："${truncate(params.old_text)}" -> "${truncate(params.new_text)}"`);
				}

				case "remove": {
					if (!params.old_text) {
						return err("remove 操作需要 old_text 参数");
					}
					const entries = readEntries(filePath);
					// substring 匹配定位条目
					const matches = entries.filter((e) => e.includes(params.old_text!));
					if (matches.length === 0) return err(`未找到匹配 "${truncate(params.old_text)}" 的条目`);
					if (matches.length > 1) return err(`"${truncate(params.old_text)}" 匹配了 ${matches.length} 条，请写得更具体`);

					// 删除整条 + 清理分隔符
					const idx = entries.indexOf(matches[0]!);
					const removed = entries.splice(idx, 1)[0]!;
					writeEntries(filePath, entries);
					return ok(`已从 ${fileName} 删除："${truncate(removed)}"`);
				}
			}
		},
	};
}

/** 构造成功结果 */
function ok(message: string): AgentToolResult<{ message: string }> {
	return { content: [{ type: "text", text: message }], details: { message } };
}

/** 构造错误结果 */
function err(message: string): AgentToolResult<{ message: string }> {
	return { content: [{ type: "text", text: `错误：${message}` }], details: { message } };
}

/** 截断过长文本用于日志显示 */
function truncate(s: string, max = 60): string {
	return s.length > max ? `${s.slice(0, max)}...` : s;
}
