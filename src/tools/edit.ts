// 精确替换文件中的文本片段，支持单次批量多个替换

import { writeFile, readFile } from "fs/promises";
import { resolve } from "path";
import type { ToolDefinition } from "../types.ts";

export function createEditTool(cwd: string): ToolDefinition {
	return {
		name: "edit",
		description:
			"Edit a file by replacing exact text matches. Each edit replaces oldText with newText. oldText must be unique in the file.",
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Path to the file (relative or absolute)",
				},
				edits: {
					type: "array",
					description: "One or more targeted replacements",
					items: {
						type: "object",
						properties: {
							oldText: {
								type: "string",
								description:
									"Exact text to replace. Must be unique in the file.",
							},
							newText: {
								type: "string",
								description: "Replacement text",
							},
						},
						required: ["oldText", "newText"],
					},
				},
			},
			required: ["path", "edits"],
		},

		async execute(input) {
			const { path, edits } = input as {
				path: string;
				edits: { oldText: string; newText: string }[];
			};

			const fullPath = resolve(cwd, path);
			let content = await readFile(fullPath, "utf-8");
			let replaceCount = 0;

			for (const edit of edits) {
				const { oldText, newText } = edit;

				// 校验文本中是否存在 oldText 段落以及是否出现重复的内容
				const occurrences = content.split(oldText).length - 1;
				if (occurrences == 0)
					return `Error: oldText not found in ${path}.\n\`\`\`\n${oldText}\n\`\`\``;
				if (occurrences > 1)
					return `Error: oldText appears ${occurrences} times in ${path}. Each edit requires a unique match.\n\`\`\`\n${oldText}\n\`\`\``;

				content = content.replace(oldText, newText);
				replaceCount++;
			}

			await writeFile(fullPath, content, "utf-8");
			return `Successfully applied ${replaceCount} edit(s) to ${path}`;
		},
	};
}
