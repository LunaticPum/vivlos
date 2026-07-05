import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createToolRegistry } from "../registry.ts";
import { createReadTool } from "./read-file.ts";
import { createWriteTool } from "./write-file.ts";
import { createBashTool } from "./bash.ts";
import { createLsTool } from "./ls.ts";
import { createGrepTool } from "./grep.ts";
import { createFindTool } from "./find.ts";

/**
 * 返回内置工具列表。
 *
 * 内部通过 ToolRegistry 注册，后续运行时可通过 registry
 * 动态增删工具（P7 子 agent 委派场景可能用到）。
 */
export function createBuiltinTools(cwd: string): AgentTool<any, any>[] {
	const registry = createToolRegistry();
	registry.register(createReadTool(cwd));
	registry.register(createWriteTool(cwd));
	registry.register(createBashTool(cwd));
	registry.register(createLsTool(cwd));
	registry.register(createGrepTool(cwd));
	registry.register(createFindTool(cwd));
	return [...registry.list()];
}

export { createReadTool } from "./read-file.ts";
export { createWriteTool } from "./write-file.ts";
export { createBashTool } from "./bash.ts";
export { createLsTool } from "./ls.ts";
export { createGrepTool } from "./grep.ts";
export { createFindTool } from "./find.ts";
