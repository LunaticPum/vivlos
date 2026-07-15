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

/**
 * 返回内置工具列表。
 *
 * skillRegistry 可选 -- 传入时注册 skill 工具，不传时跳过。
 */
export function createBuiltinTools(
	cwd: string,
	skillRegistry?: SkillRegistry,
): AgentTool<any, any>[] {
	const registry = createToolRegistry();
	registry.register(createReadTool(cwd));
	registry.register(createWriteTool(cwd));
	registry.register(createBashTool(cwd));
	registry.register(createLsTool(cwd));
	registry.register(createGrepTool(cwd));
	registry.register(createFindTool(cwd));
	if (skillRegistry) {
		registry.register(createSkillTool(skillRegistry));
	}
	return [...registry.list()];
}

export { createReadTool } from "./read-file.ts";
export { createWriteTool } from "./write-file.ts";
export { createBashTool } from "./bash.ts";
export { createLsTool } from "./ls.ts";
export { createGrepTool } from "./grep.ts";
export { createFindTool } from "./find.ts";
export { createSkillTool } from "./skill.ts";
