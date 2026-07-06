import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { spawn } from "node:child_process";
import { ToolError } from "@vivlos/shared/errors.ts";

// ── Schema ──（参照 pi coding-agent bashSchema）
const Params = Type.Object({
	command: Type.String({ description: "要执行的 shell 命令" }),
	timeout: Type.Optional(
		Type.Number({ description: "超时时间（秒），默认 30 秒" }),
	),
});

type Params = Static<typeof Params>;

const MAX_CHARS = 256 * 1024; // 256K 字符截断

/**
 * 用 spawn 异步执行命令，收集 stdout/stderr，timeout 后 SIGTERM。
 * 替代 execSync 避免阻塞事件循环，支持 pi 的并行工具调度。
 */
function spawnAsync(
	command: string,
	cwd: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
	return new Promise((resolve, reject) => {
		const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
		const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];

		const child = spawn(shell, shellArgs, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf-8");
		});

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf-8");
		});

		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error(`command timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		if (signal) {
			const onAbort = () => {
				child.kill("SIGTERM");
				clearTimeout(timer);
				reject(new Error("aborted"));
			};
			signal.addEventListener("abort", onAbort, { once: true });
		}

		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ stdout, stderr, code });
		});

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

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
			signal?: AbortSignal,
		): Promise<AgentToolResult<{ message: string }>> {
			try {
				const timeoutMs = (params.timeout ?? 30) * 1000;

				const { stdout, stderr, code } = await spawnAsync(
					params.command,
					cwd,
					timeoutMs,
					signal,
				);

				if (code === null) {
					// killed by timeout or abort
					throw new Error("command killed (exit code: null)");
				}

				const combined = stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout;

				// 截断
				const text =
					combined.length > MAX_CHARS
						? combined.slice(0, MAX_CHARS) +
							`\n...[truncated ${combined.length - MAX_CHARS} chars]`
						: combined || "(no output)";

				return {
					content: [{ type: "text", text }],
					details: { message: `exit ${code} (${combined.length} chars)` },
				};
			} catch (err) {
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "bash", cause);
			}
		},
	};
}