import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { accessSync, constants, readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { ToolError } from "@vivlos/shared/errors.ts";

// ── Schema ──（参照 pi coding-agent readSchema）
const Params = Type.Object({
	path: Type.String({ description: "要读取的文件路径（相对或绝对）" }),
	offset: Type.Optional(
		Type.Integer({
			description: "起始行号（1 起始），默认从第 1 行开始",
			minimum: 1,
		}),
	),
	limit: Type.Optional(
		Type.Integer({ description: "最大读取行数，默认全部", minimum: 1 }),
	),
});

type Params = Static<typeof Params>;

const MAX_BYTES = 256 * 1024;

interface ReadDetails {
	message: string;
	path: string;
	startLine: number;
	endLine: number;
	totalLines: number;
	truncated: boolean;
	nextOffset?: number;
	oversizedLine?: number;
}

// ── 工厂 ──
export function createReadTool(cwd: string): AgentTool<typeof Params, ReadDetails> {
	return {
		name: "read",
		description: "读取文本文件。支持按行读取，输出超过 256KB 时提供后续 offset。",
		label: "读取文件",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<ReadDetails>> {
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
				if (start >= lines.length) {
					throw new Error(`起始行 ${start + 1} 超出文件范围（共 ${lines.length} 行）`);
				}
				const requestedEnd = params.limit != null
					? Math.min(start + params.limit, lines.length)
					: lines.length;
				const selectedLines = lines.slice(start, requestedEnd);
				const { output, outputLines, outputTruncated, oversizedLine } = truncateCompleteLines(
					selectedLines,
					start + 1,
				);
				const endLine = start + outputLines;
				const hasMore = oversizedLine
					? endLine < lines.length
					: outputTruncated || requestedEnd < lines.length;
				const nextOffset = hasMore ? endLine + 1 : undefined;
				const notice = nextOffset
					? oversizedLine
						? `\n\n[第 ${start + 1} 行因超过 256KB 未显示。使用 offset=${nextOffset} 继续读取后续行。]`
						: `\n\n[显示第 ${start + 1}-${endLine} 行，共 ${lines.length} 行。使用 offset=${nextOffset} 继续。]`
					: "";
				const text = output || "(empty)";

				return {
					content: [{ type: "text", text: text + notice }],
					details: {
						message: oversizedLine
							? `line ${start + 1} exceeds read limit in ${absolutePath}`
							: `read ${absolutePath} lines ${start + 1}-${endLine}`,
						path: absolutePath,
						startLine: start + 1,
						endLine,
						totalLines: lines.length,
						truncated: outputTruncated,
						...(nextOffset ? { nextOffset } : {}),
						...(oversizedLine ? { oversizedLine: start + 1 } : {}),
					},
				};
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "read", cause);
			}
		},
	};
}

function truncateCompleteLines(
	lines: readonly string[],
	startLine: number,
): {
	output: string;
	outputLines: number;
	outputTruncated: boolean;
	oversizedLine: boolean;
} {
	if (Buffer.byteLength(lines[0] ?? "", "utf-8") > MAX_BYTES) {
		return {
			output: `[第 ${startLine} 行超过 256KB，无法由 read Tool 完整返回。请使用 bash 分段读取该行。]`,
			outputLines: 1,
			outputTruncated: true,
			oversizedLine: true,
		};
	}

	const output: string[] = [];
	let bytes = 0;
	for (const line of lines) {
		const addedBytes = Buffer.byteLength(line, "utf-8") + (output.length > 0 ? 1 : 0);
		if (bytes + addedBytes > MAX_BYTES) break;
		output.push(line);
		bytes += addedBytes;
	}
	return {
		output: output.join("\n"),
		outputLines: output.length,
		outputTruncated: output.length < lines.length,
		oversizedLine: false,
	};
}
