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
});

type Params = Static<typeof Params>;

interface LsDetails {
	message: string;
	count: number;
	directories: number;
	files: number;
}

// ── 工厂 ──
export function createLsTool(cwd: string): AgentTool<typeof Params, LsDetails> {
	return {
		name: "ls",
		description: "列出目录内容。不传 path 则列出当前工作目录。",
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

				const entries = readdirSync(target, { withFileTypes: true });
				const lines: string[] = [];
				let dirs = 0;
				let files = 0;

				for (const entry of entries) {
					const type = entry.isDirectory()
						? "d"
						: entry.isSymbolicLink()
							? "l"
							: "f";
					if (entry.isDirectory()) dirs++;
					else files++;
					lines.push(`${type} ${entry.name}`);
				}

				const text = lines.join("\n") || "(empty)";
				return {
					content: [{ type: "text", text }],
					details: {
						message: `listed ${entries.length} entries (${dirs} dirs, ${files} files)`,
						count: entries.length,
						directories: dirs,
						files,
					},
				};
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "ls", cause);
			}
		},
	};
}