import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, isAbsolute, dirname, relative } from "node:path";
import { ToolError } from "@vivlos/shared/errors.ts";

// ── Schema ──（参照 pi coding-agent grepSchema）
const Params = Type.Object({
	pattern: Type.String({ description: "正则表达式搜索模式", minLength: 1 }),
	path: Type.Optional(
		Type.String({ description: "搜索路径（文件或目录），默认当前工作目录" }),
	),
	limit: Type.Optional(
		Type.Integer({
			description: "最大返回匹配数，默认 100",
			minimum: 1,
			maximum: 1000,
		}),
	),
});

type Params = Static<typeof Params>;

const MAX_CHARS = 256 * 1024;
const MAX_FILES = 500;

interface GrepDetails {
	message: string;
	matches: number;
	filesSearched: number;
	filesSkipped: number;
	resultLimitReached: boolean;
	fileLimitReached: boolean;
	outputTruncated: boolean;
}

// ── 工厂 ──
export function createGrepTool(
	cwd: string,
): AgentTool<typeof Params, GrepDetails> {
	return {
		name: "grep",
		description: "在文件中搜索正则表达式，返回相对路径、行号和匹配行。",
		label: "内容搜索",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<GrepDetails>> {
			try {
				const target = params.path ?? cwd;
				const absolutePath = isAbsolute(target)
					? resolve(target)
					: resolve(cwd, target);

				const isDir = statSync(absolutePath).isDirectory();

				const files: string[] = isDir
					? readdirSync(absolutePath, { recursive: true, withFileTypes: true })
							.filter((e) => e.isFile())
							.map((e) => resolve(e.parentPath ?? absolutePath, e.name))
					: [absolutePath];

				files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
				const visibleFiles = files.slice(0, MAX_FILES);
				const searchRoot = isDir ? absolutePath : dirname(absolutePath);
				const regex = new RegExp(params.pattern);
				const limit = params.limit ?? 100;
				const results: string[] = [];
				let filesSearched = 0;
				let filesSkipped = 0;
				let resultLimitReached = false;

				search: for (const file of visibleFiles) {
					try {
						const content = readFileSync(file, "utf-8");
						filesSearched++;
						const lines = content.split("\n");
						for (let index = 0; index < lines.length; index++) {
							const line = lines[index] ?? "";
							if (regex.test(line)) {
								if (results.length >= limit) {
									resultLimitReached = true;
									break search;
								}
								const displayPath = relative(searchRoot, file).replace(/\\/g, "/");
								results.push(`${displayPath}:${index + 1}: ${line.trim().slice(0, 500)}`);
							}
						}
					} catch (error) {
						if (!isDir) throw error;
						filesSkipped++;
					}
				}
				const fileLimitReached = files.length > visibleFiles.length &&
					!resultLimitReached &&
					filesSearched + filesSkipped === visibleFiles.length;

				let text = results.join("\n") || "(no matches)";
				const outputTruncated = text.length > MAX_CHARS;
				if (text.length > MAX_CHARS) {
					text =
						text.slice(0, MAX_CHARS) +
						`\n...[truncated ${text.length - MAX_CHARS} chars]`;
				}
				const notices: string[] = [];
				if (resultLimitReached) notices.push(`达到 ${limit} 条匹配上限`);
				if (fileLimitReached) notices.push(`仅搜索前 ${MAX_FILES}/${files.length} 个文件`);
				if (filesSkipped > 0) notices.push(`跳过 ${filesSkipped} 个不可读文件`);
				if (notices.length > 0) text += `\n\n[${notices.join("；")}。]`;

				return {
					content: [{ type: "text", text }],
					details: {
						message: `matched ${results.length}${resultLimitReached ? "+" : ""} lines in ${filesSearched} files`,
						matches: results.length,
						filesSearched,
						filesSkipped,
						resultLimitReached,
						fileLimitReached,
						outputTruncated,
					},
				};
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "grep", cause);
			}
		},
	};
}
