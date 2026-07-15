import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createToolRegistry } from "../registry.ts";
import { createReadTool } from "./read-file.ts";
import { createWriteTool } from "./write-file.ts";
import { createBashTool } from "./bash.ts";
import { createLsTool } from "./ls.ts";
import { createGrepTool } from "./grep.ts";
import { createFindTool } from "./find.ts";
import { createSkillTool } from "./skill.ts";
import type { SkillRegistry } from "@vivlos/agent/skills/index.ts";

/** 内置工具创建结果 */
export interface BuiltinToolsHandle {
	/** 工具列表，传给 createAgent */
	tools: AgentTool<any, any>[];
	/** 重置所有有状态的工具（如 skill 的 loadedSkills），会话清理时调用 */
	reset: () => void;
}

/**
 * 创建内置工具列表。
 *
 * skillRegistry 可选 -- 传入时注册 skill 工具，不传时跳过。
 * 返回 { tools, reset } -- reset 在会话清理（/clear）时调用。
 */
export function createBuiltinTools(
	cwd: string,
	skillRegistry?: SkillRegistry,
): BuiltinToolsHandle {
	const registry = createToolRegistry();
	registry.register(createReadTool(cwd));
	registry.register(createWriteTool(cwd));
	registry.register(createBashTool(cwd));
	registry.register(createLsTool(cwd));
	registry.register(createGrepTool(cwd));
	registry.register(createFindTool(cwd));

	const resets: (() => void)[] = [];

	if (skillRegistry) {
		const { tool, reset } = createSkillTool(skillRegistry);
		registry.register(tool);
		resets.push(reset);
	}

	return {
		tools: [...registry.list()],
		reset: () => resets.forEach((fn) => fn()),
	};
}

export { createReadTool } from "./read-file.ts";
export { createWriteTool } from "./write-file.ts";
export { createBashTool } from "./bash.ts";
export { createLsTool } from "./ls.ts";
export { createGrepTool } from "./grep.ts";
export { createFindTool } from "./find.ts";
export { createSkillTool } from "./skill.ts";
