import type { ToolDefinition } from "../types.ts";

export class ToolRegistry {
	private tools = new Map<string, ToolDefinition>();

	/**
	 * 注册一个工具
	 * @param tool 工具定义
	 */
	register(tool: ToolDefinition): void {
		this.tools.set(tool.name, tool);
	}

	/**
	 * 按名称查找已注册的工具定义
	 * @param name 工具名称
	 * @returns 已注册的工具定义
	 */
	get(name: string): ToolDefinition | undefined {
		return this.tools.get(name);
	}

	/**
	 * 获取所有已注册的工具定义
	 * @returns 所有已注册的工具定义
	 */
	getAll(): ToolDefinition[] {
		return Array.from(this.tools.values());
	}

	async execute(
		name: string,
		args: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<string> {
		const tool = this.tools.get(name);
		if (!tool) {
			throw new Error(`未知工具: ${name}`);
		}
		return tool.execute(args, signal);
	}
}
