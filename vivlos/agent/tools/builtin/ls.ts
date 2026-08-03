import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { readdirSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { ToolError } from "@vivlos/shared/errors.ts";

// ── Schema ──（参照 pi coding-agent lsSchema）
const Params = Type.Object({
	path: Type.Optional(
		Type.String({ description: "目录路径，默认当前工作目录" }),
	),
	limit: Type.Optional(
		Type.Integer({ description: "最大返回条目数，默认 500", minimum: 1 }),
	),
});

type Params = Static<typeof Params>;

interface LsDetails {
	message: string;
	count: number;
	totalCount: number;
	directories: number;
	files: number;
	symlinks: number;
	entryLimitReached: boolean;
}

// ── 工厂 ──
export function createLsTool(cwd: string): AgentTool<typeof Params, LsDetails> {
	return {
		name: "ls",
		description: "列出目录内容并按名称排序，最多返回指定数量的条目。",
		label: "列出目录",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<LsDetails>> {
			try {
				const target = params.path
					? isAbsolute(params.path)
						? resolve(params.path)
						: resolve(cwd, params.path)
					: cwd;

				const entries = readdirSync(target, { withFileTypes: true })
					.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
				const limit = params.limit ?? 500;
				const visibleEntries = entries.slice(0, limit);
				const lines: string[] = [];
				let dirs = 0;
				let files = 0;
				let symlinks = 0;

				for (const entry of visibleEntries) {
					const type = entry.isDirectory()
						? "d"
						: entry.isSymbolicLink()
							? "l"
							: "f";
					if (entry.isDirectory()) dirs++;
					else if (entry.isSymbolicLink()) symlinks++;
					else files++;
					lines.push(`${type} ${entry.name}`);
				}

				const entryLimitReached = entries.length > visibleEntries.length;
				const notice = entryLimitReached
					? `\n\n[目录共 ${entries.length} 个条目，仅显示前 ${visibleEntries.length} 个。]`
					: "";
				const text = (lines.join("\n") || "(empty)") + notice;
				return {
					content: [{ type: "text", text }],
					details: {
						message: `listed ${visibleEntries.length}/${entries.length} entries`,
						count: visibleEntries.length,
						totalCount: entries.length,
						directories: dirs,
						files,
						symlinks,
						entryLimitReached,
					},
				};
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "ls", cause);
			}
		},
	};
}
