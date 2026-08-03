/**
 * consolidate tool -- L1 记忆巩固（refine / merge）。
 *
 * 本脚本最终只负责 Tool schema、参数转换、MemoryService 调用和结果格式化。
 * Tool 不直接访问 Repository，也不会注册到主模型的 advanced tools 中。
 */

import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ConsolidationMemoryCommand } from "@vivlos/agent/memory/consolidate.ts";
import type {
	MemoryOperationContext,
	MemoryService,
	MemoryServiceResult,
	MemoryServiceValue,
} from "@vivlos/agent/memory/service.ts";
import { err, ok, type Result } from "@vivlos/shared";
import { consolidateDescription } from "./description.ts";

// #region Tool 参数

/** memory/user 枚举在根 schema 中复用，避免两个 action 的描述发生漂移。 */
const MemoryFileSchema = Type.Union(
	[Type.Literal("memory"), Type.Literal("user")],
	{
		description: "Target Memory file",
	},
);

/**
 * 使用单一 object 作为 Tool 参数根节点，兼容当前模型工具协议。
 * old_entry/old_entries 的 action 专属必填关系由 toConsolidationCommand 收窄。
 */
const Params = Type.Object({
	action: Type.Union([Type.Literal("refine"), Type.Literal("merge")], {
		description: "Consolidation operation",
	}),
	file: MemoryFileSchema,
	old_entry: Type.Optional(
		Type.String({
			description: "Source entry for refine",
			minLength: 1,
		}),
	),
	old_entries: Type.Optional(
		Type.Array(
			Type.String({
				description: "Source entry for merge",
				minLength: 1,
			}),
			{
				description: "Source entries for merge",
				minItems: 2,
				uniqueItems: true,
			},
		),
	),
	new_entry: Type.String({
		description: "Consolidated entry",
		minLength: 1,
	}),
});

type Params = Static<typeof Params>;

// #endregion

// #region Tool 依赖

/**
 * Consolidate Tool 的最小依赖。
 *
 * context 由后续 Consolidator Runtime 在每次调用时动态提供，模型参数不能伪造
 * sessionId、reasonCode、reason 或 source。
 */
export interface ConsolidateToolDeps {
	readonly memoryService: MemoryService;
	readonly getOperationContext: () => MemoryOperationContext;
}

/** TUI 可读取简短 message；完整结构化结果保留给调用链诊断。 */
export interface ConsolidateToolDetails {
	readonly message: string;
	readonly result?: MemoryServiceResult;
}

// #endregion

// #region 参数转换

/** action 专属参数缺失时返回的稳定 Tool 边界错误。 */
interface ConsolidateToolParameterError {
	readonly code: "invalid_tool_params";
	readonly message: string;
}

type ConsolidateToolCommandResult = Result<
	ConsolidationMemoryCommand,
	ConsolidateToolParameterError
>;

/** 将 Tool 的 snake_case 参数收窄为 MemoryService 使用的领域命令。 */
function toConsolidationCommand(params: Params): ConsolidateToolCommandResult {
	switch (params.action) {
		case "refine":
			if (params.old_entry === undefined || params.old_entries !== undefined) {
				return err({
					code: "invalid_tool_params",
					message: "refine 操作只接受 old_entry 参数",
				});
			}
			return ok({
				action: "refine",
				file: params.file,
				oldEntry: params.old_entry,
				newEntry: params.new_entry,
			});

		case "merge":
			if (params.old_entries === undefined || params.old_entry !== undefined) {
				return err({
					code: "invalid_tool_params",
					message: "merge 操作只接受 old_entries 参数",
				});
			}
			return ok({
				action: "merge",
				file: params.file,
				oldEntries: params.old_entries,
				newEntry: params.new_entry,
			});
	}
}

// #endregion

// #region Tool 主入口

/**
 * 创建仅供 Consolidator Runtime 持有的记忆巩固 Tool。
 *
 * 调用方应把该 Tool 放入 Consolidator 的受限工具集，不能加入主模型的
 * createAdvancedTools()。所有领域校验、安全扫描、写盘和 Event 由 Service 负责。
 */
export function createConsolidateTool(
	deps: ConsolidateToolDeps,
): AgentTool<typeof Params, ConsolidateToolDetails> {
	return {
		name: "consolidate",
		description: consolidateDescription,
		label: "记忆巩固",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<ConsolidateToolDetails>> {
			const commandResult = toConsolidationCommand(params);
			if (!commandResult.ok) {
				return parameterError(commandResult.error);
			}

			const result = deps.memoryService.executeConsolidation(
				commandResult.value,
				deps.getOperationContext(),
			);
			return formatResult(result);
		},
	};
}

// #endregion

// #region Tool 返回结果

/** 参数错误不回显原始参数，避免未经 Service 扫描的候选进入 Tool 留痕。 */
function parameterError(
	error: ConsolidateToolParameterError,
): AgentToolResult<ConsolidateToolDetails> {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{ status: "rejected", code: error.code, message: error.message },
					null,
					2,
				),
			},
		],
		details: { message: error.message },
	};
}

/**
 * 将 Service 终态转换为模型可读 JSON。
 *
 * 完整 entry 不截断，因为后续独立操作需要使用精确 source；Service 的 rejected
 * 结果已经去除不安全候选，因此错误分支只序列化该安全结构。
 */
function formatResult(
	result: MemoryServiceResult,
): AgentToolResult<ConsolidateToolDetails> {
	if (!result.ok) {
		const payload = { status: "rejected", ...result.error };
		return {
			content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
			details: {
				message: `[${result.error.code}] ${result.error.message}`,
				result,
			},
		};
	}

	return {
		content: [{ type: "text", text: JSON.stringify(result.value, null, 2) }],
		details: { message: formatSummary(result.value), result },
	};
}

function formatSummary(value: MemoryServiceValue): string {
	const fileName = value.file === "memory" ? "memory.md" : "user.md";
	const usage = `${value.usage.used}/${value.usage.cap} 字符`;
	if (value.status === "noop") return `${fileName} 内容未变化（${usage}）`;
	if (value.action === "merge") {
		return `已合并 ${fileName} 的 ${value.beforeEntries?.length ?? 0} 条记忆（${usage}）`;
	}
	return `已精炼 ${fileName}（${usage}）`;
}

// #endregion
