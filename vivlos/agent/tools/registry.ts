import type { AgentTool } from "@earendil-works/pi-agent-core";

/**
 * 工具注册表。
 *
 * 薄封装——直接存 pi 的 AgentTool，不做额外的类型转换。
 * register/list/get 三个操作，启动时注册内置工具，
 * agent-loop 通过 list() 取工具列表传给 pi 的 AgentContext.tools。
 */
export interface ToolRegistry {
	/** 注册一个工具（同名覆盖） */
	register(tool: AgentTool<any, any>): void;
	/** 获取所有已注册工具 */
	list(): readonly AgentTool<any, any>[];
	/** 按名称查找 */
	get(name: string): AgentTool<any, any> | undefined;
}

export function createToolRegistry(): ToolRegistry {
	const tools = new Map<string, AgentTool<any, any>>();

	return {
		register(tool) {
			tools.set(tool.name, tool);
		},
		list() {
			return [...tools.values()];
		},
		get(name) {
			return tools.get(name);
		},
	};
}
