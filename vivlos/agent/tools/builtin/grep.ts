import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";

// ── Schema ──（参照 pi coding-agent grepSchema）
const Params = Type.Object({
	pattern: Type.String({ description: "正则表达式搜索模式" }),
	path: Type.Optional(
		Type.String({ description: "搜索路径（文件或目录），默认当前工作目录" }),
	),
});

type Params = Static<typeof Params>;

const MAX_CHARS = 256 * 1024;

interface GrepDetails {
	message: string;
	matches: number;
}

// ── 工厂 ──
export function createGrepTool(cwd: string): AgentTool<typeof Params, GrepDetails> {
	return {
		name: "grep",
		description: "在文件中搜索匹配指定正则表达式的内容。",
		label: "内容搜索",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<GrepDetails>> {
			const target = params.path ?? cwd;
			const absolutePath = isAbsolute(target)
				? resolve(target)
				: resolve(cwd, target);

			// 判断是文件还是目录
			let isDir = false;
			try {
				isDir = statSync(absolutePath).isDirectory();
			} catch {
				/* path 不存在时当作文件处理，后续 readFileSync 会抛异常 */
			}

			const files: string[] = isDir
				? readdirSync(absolutePath, { recursive: true, withFileTypes: true })
						.filter((e) => e.isFile())
						.map((e) => resolve(e.parentPath ?? absolutePath, e.name))
				: [absolutePath];

			const regex = new RegExp(params.pattern, "g");
			const results: string[] = [];
			let matchCount = 0;

			for (const file of files.slice(0, 50)) {
				// 限制最多搜 50 个文件
				try {
					const content = readFileSync(file, "utf-8");
					for (const line of content.split("\n")) {
						if (regex.test(line)) {
							regex.lastIndex = 0; // reset after test
							results.push(`${file}: ${line.trim().slice(0, 200)}`);
							matchCount++;
						}
						regex.lastIndex = 0;
					}
				} catch {
					/* skip unreadable files */
				}
			}

			let text = results.join("\n") || "(no matches)";
			if (text.length > MAX_CHARS) {
				text = text.slice(0, MAX_CHARS) +
					`\n...[truncated ${text.length - MAX_CHARS} chars]`;
			}

			return {
				content: [{ type: "text", text }],
				details: {
					message: `matched ${matchCount} lines in ${files.length} files`,
					matches: matchCount,
				},
			};
		},
	};
}
