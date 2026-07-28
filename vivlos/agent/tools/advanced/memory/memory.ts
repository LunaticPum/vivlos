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
 * 存储：当前 session 目录下的 memory.md + user.md，条目间用 --- 分隔。
 */

import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type {
	MainMemoryCommand,
	MemoryOperationContext,
	MemoryService,
	MemoryServiceResult,
} from "@vivlos/agent/memory-refactor/index.ts";
import { MAIN_MEMORY_REASON_CODES } from "@vivlos/agent/memory-refactor/index.ts";
import { memoryDescription } from "./description.ts";

// #region Tool 参数

const Params = Type.Object({
	action: Type.Union(
		[Type.Literal("add"), Type.Literal("replace"), Type.Literal("remove")],
		{ description: "操作类型" },
	),
	file: Type.Union([Type.Literal("memory"), Type.Literal("user")], {
		description: "目标文件：memory = 项目/环境笔记，user = 用户画像",
	}),
	content: Type.Optional(
		Type.String({ description: "要追加的内容（add 时必填）" }),
	),
	old_text: Type.Optional(
		Type.String({ description: "要匹配的子串（replace/remove 时必填）" }),
	),
	new_text: Type.Optional(
		Type.String({ description: "替换后的文本（replace 时必填）" }),
	),
	reasonCode: Type.Union(
		[
			Type.Literal(MAIN_MEMORY_REASON_CODES[0]),
			Type.Literal(MAIN_MEMORY_REASON_CODES[1]),
			Type.Literal(MAIN_MEMORY_REASON_CODES[2]),
			Type.Literal(MAIN_MEMORY_REASON_CODES[3]),
			Type.Literal(MAIN_MEMORY_REASON_CODES[4]),
		],
		{ description: "本次记忆操作的稳定原因分类（必填）" },
	),
	reason: Type.Optional(
		Type.String({
			description: "简短、可审计的原因说明；不要包含完整推理",
			maxLength: 200,
		}),
	),
});

type Params = Static<typeof Params>;

export interface MemoryToolDeps {
	readonly getMemoryService: () => MemoryService;
	readonly getMemoryOperationContext: (
		command: MainMemoryCommand,
		reasonCode: string,
		reason?: string,
	) => MemoryOperationContext;
	readonly onCapacityExceeded?: (
		command: MainMemoryCommand,
		result: MemoryServiceResult,
	) => void;
}

export interface MemoryToolDetails {
	readonly message: string;
	readonly result?: MemoryServiceResult;
}

// #endregion

// #region Tool 主入口

/**
 * 创建 memory tool。
 *
 * 此层只负责参数适配和返回文案；所有安全与写入规则由 MemoryService 统一处理。
 */
export function createMemoryTool(
	deps: MemoryToolDeps,
): AgentTool<typeof Params, MemoryToolDetails> {
	return {
		name: "memory",
		description: memoryDescription,
		label: "记忆管理",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<MemoryToolDetails>> {
			const command = toCommand(params);
			if (typeof command === "string") return err(command);

			const result = deps.getMemoryService().executeMain(
				command,
				deps.getMemoryOperationContext(command, params.reasonCode, params.reason),
			);
			deps.onCapacityExceeded?.(command, result);
			if (!result.ok) {
				return err(result.error.message, result);
			}
			return ok(formatSuccess(command, result), result);
		},
	};
}

// #endregion

// #region Tool 返回结果

/** 构造成功结果 */
function ok(
	message: string,
	result?: MemoryServiceResult,
): AgentToolResult<MemoryToolDetails> {
	return {
		content: [{ type: "text", text: message }],
		details: { message, result },
	};
}

/** 构造错误结果 */
function err(
	message: string,
	result?: MemoryServiceResult,
): AgentToolResult<MemoryToolDetails> {
	const code = result && !result.ok ? `[${result.error.code}] ` : "";
	return {
		content: [{ type: "text", text: `错误：${code}${message}` }],
		details: { message, result },
	};
}

/** 将宽松的 Tool 参数收窄为 MemoryService 命令。 */
function toCommand(params: Params): MainMemoryCommand | string {
	switch (params.action) {
		case "add":
			if (!params.content) return "add 操作需要 content 参数";
			return {
				action: "add",
				file: params.file,
				content: params.content,
			};
		case "replace":
			if (!params.old_text || params.new_text === undefined) {
				return "replace 操作需要 old_text 和 new_text 参数";
			}
			return {
				action: "replace",
				file: params.file,
				oldText: params.old_text,
				newText: params.new_text,
			};
		case "remove":
			if (!params.old_text) return "remove 操作需要 old_text 参数";
			return {
				action: "remove",
				file: params.file,
				oldText: params.old_text,
			};
	}
}

function formatSuccess(command: MainMemoryCommand, result: MemoryServiceResult): string {
	if (!result.ok) return result.error.message;
	const mutation = result.value;
	const fileName = mutation.file === "memory" ? "memory.md" : "user.md";
	const usage = `（${mutation.usage.used}/${mutation.usage.cap} 字符）`;

	if (mutation.status === "noop") {
		return `内容未变化（静默跳过）${usage}`;
	}
	switch (command.action) {
		case "add":
			return `已写入 ${fileName}："${truncate(mutation.after!)}"${usage}`;
		case "replace":
			return `已替换 ${fileName} 中："${truncate(mutation.before!)}" -> "${truncate(mutation.after!)}"${usage}`;
		case "remove":
			return `已从 ${fileName} 删除："${truncate(mutation.before!)}"${usage}`;
	}
	return "记忆操作已完成";
}

/** 截断过长文本用于日志显示 */
function truncate(s: string, max = 60): string {
	return s.length > max ? `${s.slice(0, max)}...` : s;
}

// #endregion
