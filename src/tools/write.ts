// 创建新文件或覆盖已有文件

import { writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import type { ToolDefinition } from "../types.ts";

export function createWriteTool(cwd: string): ToolDefinition {
	return {
		name: "write",
		description:
			"Create a new file or overwrite an existing file. Automatically creates parent directories if they don't exist.",
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Path to the file (relative or absolute)",
				},
				content: {
					type: "string",
					description: "Content to write to the file",
				},
			},
			required: ["path", "content"],
		},

		async execute(input) {
			const { path, content } = input as {
				path: string;
				content: string;
			};

			const fullPath = resolve(cwd, path);

			// 先校验目录是否存在，如果不存在则创建目录
			await mkdir(dirname(fullPath), { recursive: true }); // recursive: true 如果父目录不存在，自动创建所有层级

			// 创建完目录后，创建文件并写入字节内容，内容按照 utf-8 编码
			await writeFile(fullPath, content, "utf-8");

			return `Successfully wrote ${content.length} bytes to ${path}`;
		},
	};
}
