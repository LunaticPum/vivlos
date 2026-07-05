import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { readdirSync } from "node:fs";
import { resolve, isAbsolute, basename } from "node:path";

// ── Schema ──（参照 pi coding-agent findSchema）
const Params = Type.Object({
	pattern: Type.String({ description: "文件名 glob 模式（如 *.ts、test*）" }),
	path: Type.Optional(
		Type.String({ description: "搜索起始路径，默认当前工作目录" }),
	),
});

type Params = Static<typeof Params>;

const MAX_CHARS = 256 * 1024;
const MAX_FILES = 100; // 限制搜索文件数

interface FindDetails {
	message: string;
	count: number;
}

// ── 工厂 ──
export function createFindTool(cwd: string): AgentTool<typeof Params, FindDetails> {
	return {
		name: "find",
		description: "按文件名模式搜索文件（支持 * 和 ? 通配符）。",
		label: "查找文件",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<FindDetails>> {
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
			let count = 0;
			try {
				const entries = readdirSync(absolutePath, {
					recursive: true,
					withFileTypes: true,
				});
				for (const entry of entries) {
					if (count >= MAX_FILES) break;
					if (entry.isFile() && regex.test(basename(entry.name))) {
						const fullPath = resolve(
							entry.parentPath ?? absolutePath,
							entry.name,
						);
						matches.push(fullPath);
						count++;
					}
				}
			} catch {
				/* directory may not exist */
			}

			let text = matches.join("\n") || "(no matches)";
			if (text.length > MAX_CHARS) {
				text = text.slice(0, MAX_CHARS) +
					`\n...[truncated ${text.length - MAX_CHARS} chars]`;
			}

			return {
				content: [{ type: "text", text }],
				details: {
					message: `found ${matches.length} files`,
					count: matches.length,
				},
			};
		},
	};
}
