import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { ToolError } from "@vivlos/shared/errors.ts";

// ── Schema ──（参照 pi coding-agent writeSchema）
const Params = Type.Object({
	path: Type.String({ description: "要写入的文件路径（相对或绝对）" }),
	content: Type.String({ description: "要写入的文件内容" }),
});

type Params = Static<typeof Params>;

// ── 工厂 ──
export function createWriteTool(cwd: string): AgentTool<typeof Params, { message: string }> {
	return {
		name: "write",
		description: "创建或覆盖文本文件，目录不存在时自动创建。",
		label: "写入文件",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<{ message: string }>> {
			try {
				// 1. 解析为绝对路径
				const absolutePath = isAbsolute(params.path)
					? resolve(params.path)
					: resolve(cwd, params.path);

				// 2. 确保目录存在
				mkdirSync(dirname(absolutePath), { recursive: true });

				// 3. 写文件
				writeFileSync(absolutePath, params.content, "utf-8");

				return {
					content: [
						{
							type: "text",
							text: `文件已写入: ${absolutePath} (${params.content.length} chars)`,
						},
					],
					details: {
						message: `wrote ${absolutePath} (${params.content.length} chars)`,
					},
				};
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "write", cause);
			}
		},
	};
}
