import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { accessSync, constants, readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { ToolError } from "@vivlos/shared/errors.ts";

// ── Schema ──（参照 pi coding-agent readSchema）
const Params = Type.Object({
	path: Type.String({ description: "要读取的文件路径（相对或绝对）" }),
	offset: Type.Optional(
		Type.Number({ description: "起始行号（1 起始），默认从第 1 行开始" }),
	),
	limit: Type.Optional(
		Type.Number({ description: "最大读取行数，默认全部" }),
	),
});

type Params = Static<typeof Params>;

const MAX_CHARS = 256 * 1024; // 256K 字符截断（非精确字节）

// ── 工厂 ──
export function createReadTool(cwd: string): AgentTool<typeof Params, { message: string }> {
	return {
		name: "read",
		description:
			"读取文件内容。支持 offset（起始行）和 limit（最大行数）。大文件自动截断。",
		label: "读取文件",
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

				// 2. 检查可读性
				accessSync(absolutePath, constants.R_OK);

				// 3. 读文件
				const raw = readFileSync(absolutePath, "utf-8");
				const lines = raw.split("\n");

				// 4. offset / limit 截取
				const start = (params.offset ?? 1) - 1;
				const end = params.limit != null ? start + params.limit : lines.length;
				const sliced = lines.slice(start, end).join("\n");

				// 5. 大文件截断（按 UTF-8 字节安全截断，避免切到多字节字符中间）
				let truncated = sliced;
				const byteLen = Buffer.byteLength(sliced, "utf-8");
				if (byteLen > MAX_CHARS) {
					truncated = Buffer.from(sliced, "utf-8")
						.slice(0, MAX_CHARS)
						.toString("utf-8");
					truncated += `\n...[truncated ${byteLen - MAX_CHARS} bytes]`;
				}

				return {
					content: [{ type: "text", text: truncated || "(empty)" }],
					details: {
						message: `read ${absolutePath} (${sliced.length} chars)`,
					},
				};
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "read", cause);
			}
		},
	};
}