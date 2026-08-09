/**
 * 任务类别的工具白名单。
 *
 * 硬编码的权限档案：exploring 只读、writing 可写。
 * 不做权限派生系统；delegate/todo/memory/offer_choice/session_search
 * 按设计不进入任何子 agent（禁递归、无计划层、不碰 Memory）。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { TaskKind } from "./types.ts";

const KIND_TOOL_NAMES: Record<TaskKind, readonly string[]> = {
	exploring: ["read", "ls", "grep", "find", "skill"],
	writing: ["read", "write", "bash", "ls", "grep", "find", "skill"],
};

/** 给定类别的工具白名单名称。 */
export function getToolNamesForKind(kind: TaskKind): readonly string[] {
	return KIND_TOOL_NAMES[kind];
}

/** 从全部工具中筛出给定类别的子 agent 可用工具。 */
export function filterToolsForKind(
	kind: TaskKind,
	tools: readonly AgentTool<any, any>[],
): AgentTool<any, any>[] {
	const allowed = new Set<string>(KIND_TOOL_NAMES[kind]);
	return tools.filter((tool) => allowed.has(tool.name));
}
