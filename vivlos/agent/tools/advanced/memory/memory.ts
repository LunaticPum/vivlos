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
import type { AdvancedToolDeps } from "../index.ts";
import { description } from "./description.ts";

// #region Tool 参数

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

// #endregion

// #region Tool 主入口

/**
 * 创建 memory tool。
 *
 * 此层只负责校验 tool 参数和格式化返回文案；所有文件与安全规则由 MemoryStore 统一处理。
 */
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

			switch (params.action) {
				case "add": {
					if (!params.content) {
						return err("add 操作需要 content 参数");
					}
					const result = deps.memoryStore.add(params.file, params.content);
					if (!result.ok) return err(result.error.message);
					if (result.value.status === "duplicate") {
						return ok(`已存在（静默跳过）："${truncate(result.value.content)}"`);
					}
					return ok(`已写入 ${fileName}："${truncate(result.value.content)}"`);
				}

				case "replace": {
					if (!params.old_text || params.new_text === undefined) {
						return err("replace 操作需要 old_text 和 new_text 参数");
					}
					const result = deps.memoryStore.replace(
						params.file,
						params.old_text,
						params.new_text,
					);
					if (!result.ok) return err(result.error.message);
					return ok(
						`已替换 ${fileName} 中："${truncate(params.old_text)}" -> "${truncate(result.value.content)}"`,
					);
				}

				case "remove": {
					if (!params.old_text) {
						return err("remove 操作需要 old_text 参数");
					}
					const result = deps.memoryStore.remove(params.file, params.old_text);
					if (!result.ok) return err(result.error.message);
					return ok(`已从 ${fileName} 删除："${truncate(result.value.content)}"`);
				}
			}
		},
	};
}

// #endregion

// #region Tool 返回结果

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

// #endregion
