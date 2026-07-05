import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createReadTool } from "./read-file.ts";
import { createWriteTool } from "./write-file.ts";
import { createBashTool } from "./bash.ts";
import { createLsTool } from "./ls.ts";
import { createGrepTool } from "./grep.ts";
import { createFindTool } from "./find.ts";

/** 返回内置工具（薄封装 pi coding-agent 的实现逻辑） */
export function createBuiltinTools(cwd: string): AgentTool<any, any>[] {
	return [
		createReadTool(cwd),
		createWriteTool(cwd),
		createBashTool(cwd),
		createLsTool(cwd),
		createGrepTool(cwd),
		createFindTool(cwd),
	];
}

export { createReadTool } from "./read-file.ts";
export { createWriteTool } from "./write-file.ts";
export { createBashTool } from "./bash.ts";
export { createLsTool } from "./ls.ts";
export { createGrepTool } from "./grep.ts";
export { createFindTool } from "./find.ts";
