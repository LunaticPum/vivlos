import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { readdirSync } from "node:fs";
import { resolve, isAbsolute, basename, relative } from "node:path";
import { ToolError } from "@vivlos/shared/errors.ts";

// ── Schema ──（参照 pi coding-agent findSchema）
const Params = Type.Object({
	pattern: Type.String({
		description: "文件名通配模式（如 *.ts、test?），支持 * 和 ?",
		minLength: 1,
	}),
	path: Type.Optional(
		Type.String({ description: "搜索起始路径，默认当前工作目录" }),
	),
	limit: Type.Optional(
		Type.Integer({
			description: "最大返回文件数，默认 100",
			minimum: 1,
			maximum: 1000,
		}),
	),
});

type Params = Static<typeof Params>;

interface FindDetails {
	message: string;
	count: number;
	resultLimitReached: boolean;
}

// ── 工厂 ──
export function createFindTool(cwd: string): AgentTool<typeof Params, FindDetails> {
	return {
		name: "find",
		description: "递归搜索文件名，支持 * 和 ? 通配符，返回相对搜索目录的路径。",
		label: "查找文件",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<FindDetails>> {
			try {
				const target = params.path ?? cwd;
				const absolutePath = isAbsolute(target)
					? resolve(target)
					: resolve(cwd, target);

				// 将 glob 模式转为正则（只处理 * 和 ?）
				const regexStr = params.pattern
					.replace(/[.+^${}()|[\]\\]/g, "\\$&")
					.replace(/\*/g, ".*")
					.replace(/\?/g, ".");
				const regex = new RegExp(`^${regexStr}$`, "i");

				const matches: string[] = [];
				const entries = readdirSync(absolutePath, {
					recursive: true,
					withFileTypes: true,
				});
				for (const entry of entries) {
					if (entry.isFile() && regex.test(basename(entry.name))) {
						const absoluteMatch = resolve(entry.parentPath ?? absolutePath, entry.name);
						matches.push(relative(absolutePath, absoluteMatch).replace(/\\/g, "/"));
					}
				}
				matches.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
				const limit = params.limit ?? 100;
				const visibleMatches = matches.slice(0, limit);
				const resultLimitReached = matches.length > visibleMatches.length;

				const notice = resultLimitReached
					? `\n\n[找到超过 ${limit} 个文件，仅显示前 ${limit} 个。]`
					: "";
				const text = (visibleMatches.join("\n") || "(no matches)") + notice;

				return {
					content: [{ type: "text", text }],
					details: {
						message: `found ${visibleMatches.length}${resultLimitReached ? "+" : ""} files`,
						count: visibleMatches.length,
						resultLimitReached,
					},
				};
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "find", cause);
			}
		},
	};
}
