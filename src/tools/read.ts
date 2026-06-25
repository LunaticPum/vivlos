// 读取文件内容，支持指定行范围

import { readFile } from "fs/promises";
import { resolve } from "path";
import type { ToolDefinition } from "../types.ts";

const MAX_LINES = 2000; // Maximum number of lines to read

export function createReadTool(cwd: string): ToolDefinition {
	return {
		name: "read",
		description:
			"Read file content. Supports specifying line range via offset and limit",
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Path to the file (relative or absolute)",
				},
				offset: {
					type: "number",
					description: "Starting line number (1-indexed)",
				},
				limit: {
					type: "number",
					description: "Maximum number of lines to read",
				},
			},
			required: ["path"],
		},

		async execute(input) {
			const { path, offset, limit } = input as {
				path: string;
				offset?: number;
				limit?: number;
			};

			const fullPath = resolve(cwd, path); // 将相对路径转为基于 cwd 的绝对路径（如是绝对路径则直接使用）
			const content = await readFile(fullPath, "utf-8");
			const lines = content.split("\n");

			const startLine = offset ? Math.max(1, offset) : 1;
			const endLine = limit
				? Math.min(startLine + limit - 1, startLine + MAX_LINES - 1)
				: Math.min(lines.length, startLine + MAX_LINES - 1);

			const selected = lines.slice(startLine - 1, endLine);

			// 拼接得到结果
			return [
				`File ${path} (lines ${startLine}-${endLine}, total ${lines.length} lines): `,
				"```",
				...selected,
				"```",
			].join("\n");
		},
	};
}
