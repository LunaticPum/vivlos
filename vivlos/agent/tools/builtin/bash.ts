import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { execSync } from "node:child_process";

// ── Schema ──（参照 pi coding-agent bashSchema）
const Params = Type.Object({
	command: Type.String({ description: "要执行的 shell 命令" }),
	timeout: Type.Optional(
		Type.Number({ description: "超时时间（秒），默认 30 秒" }),
	),
});

type Params = Static<typeof Params>;

const MAX_CHARS = 256 * 1024; // 256K 字符截断

// ── 工厂 ──
export function createBashTool(cwd: string): AgentTool<typeof Params, { message: string }> {
	return {
		name: "bash",
		description: "执行 shell 命令并返回 stdout。timeout 超时后终止命令。输出超过 256K 字符自动截断。",
		label: "运行命令",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
		): Promise<AgentToolResult<{ message: string }>> {
			const timeoutMs = (params.timeout ?? 30) * 1000;

			const output = execSync(params.command, {
				cwd,
				encoding: "utf-8",
				timeout: timeoutMs,
				maxBuffer: 1024 * 1024, // 1MB
			});

			// 截断大输出
			const text =
				output.length > MAX_CHARS
					? output.slice(0, MAX_CHARS) +
						`\n...[truncated ${output.length - MAX_CHARS} chars]`
					: output || "(no output)";

			return {
				content: [{ type: "text", text }],
				details: { message: `exit 0 (${output.length} chars)` },
			};
		},
	};
}
