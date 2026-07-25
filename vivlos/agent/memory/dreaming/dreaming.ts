/**
 * Dreaming -- 记忆审视（参照 Hermes Loop 步骤 8，01-arch.md §2.1）。
 *
 * 每轮对话结束后"做梦"：审视本轮内容，把值得记的沉淀到长期记忆。
 * 有料 -> 写入 memory.md / user.md；无料 -> 跳过。
 *
 * 写盘不影响当前 session 的 SP（Frozen Snapshot），下个 session 才生效。
 */

import type { Message, Model, Api, Context, TextContent } from "@earendil-works/pi-ai";
import type { MemoryStore } from "../types.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import { log } from "@vivlos/infra/logger/index.ts";
import { DREAMING_PROMPT } from "./prompt.ts";

// #region 类型

interface DreamingEntry {
	file: "memory" | "user";
	content: string;
}

export interface DreamingOptions {
	llm: LLMClient;
	model: Model<Api>;
	/** 本轮新增的消息 */
	messages: Message[];
	/** 统一的安全记忆写入入口 */
	memoryStore: MemoryStore;
	signal?: AbortSignal;
}

// #endregion

// #region 主入口

/**
 * Dreaming 审视。
 *
 * 失败时静默跳过（不影响主流程），仅 log 记录。
 */
export async function dreaming(options: DreamingOptions): Promise<void> {
	const { llm, model, messages, memoryStore, signal } = options;

	if (messages.length === 0) return;

	try {
		// 1. 构造审视请求
		const conversationText = messagesToText(messages);
		const context: Context = {
			systemPrompt: DREAMING_PROMPT,
			messages: [
				{
					role: "user",
					content: `审视以下对话：\n\n${conversationText}`,
					timestamp: Date.now(),
				},
			],
		};

		// 2. LLM 调用
		const stream = llm.stream(model, context, { signal });
		let raw = "";
		for await (const event of stream) {
			if (event.type === "text_delta") {
				raw += event.delta;
			}
		}

		// 3. 解析 JSON 结果
		const entries = parseEntries(raw);
		if (entries.length === 0) return;

		// 4. 统一通过 MemoryStore 安全写盘，并按实际结果统计
		let written = 0;
		for (const entry of entries) {
			const result = memoryStore.add(entry.file, entry.content);
			if (!result.ok) {
				log("warn", `Dreaming: 拒绝写入 ${entry.file}.md：${result.error.message}`);
				continue;
			}
			if (result.value.status === "written") written++;
		}

		if (written > 0) {
			log("info", `Dreaming: 写入 ${written} 条记忆`, undefined, true);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log("warn", `Dreaming 审视跳过: ${msg}`);
	}
}

// #endregion

// #region 工具函数

/** 解析 LLM 返回的 JSON，提取 entries */
function parseEntries(raw: string): DreamingEntry[] {
	try {
		const jsonMatch = raw.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return [];
		const parsed = JSON.parse(jsonMatch[0]) as { entries?: DreamingEntry[] };
		if (!Array.isArray(parsed.entries)) return [];
		return parsed.entries.filter(
			(e) =>
				(e.file === "memory" || e.file === "user") &&
				typeof e.content === "string" &&
				e.content.trim().length > 0,
		);
	} catch {
		return [];
	}
}

/** 将消息列表序列化为文本 */
function messagesToText(messages: Message[]): string {
	const lines: string[] = [];
	for (const msg of messages) {
		const text = extractText(msg);
		if (text) lines.push(`[${msg.role}]: ${text}`);
	}
	return lines.join("\n\n");
}

/** 从单条消息提取纯文本 */
function extractText(msg: Message): string {
	if (typeof msg.content === "string") return msg.content;
	return msg.content
		.filter((c): c is TextContent => c.type === "text")
		.map((c) => c.text)
		.join("");
}

// #endregion
