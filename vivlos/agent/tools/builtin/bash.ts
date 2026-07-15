import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { ToolError } from "@vivlos/shared/errors.ts";
import { getTempDir } from "@vivlos/infra/paths.ts";
import { loadBashPermissions, checkBashPermission } from "../permit/index.ts";

const Params = Type.Object({
	command: Type.String({ description: "要执行的 shell 命令" }),
	timeout: Type.Optional(
		Type.Number({ description: "超时时间（秒），默认 30 秒" }),
	),
});

type Params = Static<typeof Params>;

const MAX_CHARS = 256 * 1024;

/**
 * 查找可用的 bash 路径。
 *
 * Windows 上优先用 Git Bash（原生 UTF-8 + 标准引号规则），
 * 避免 cmd.exe 的编码和参数解析问题。
 * 参照 pi-agent-core NodeExecutionEnv 的 shell 查找逻辑。
 */
function findBash(): string {
	if (process.platform !== "win32") return "/bin/bash";

	const candidates = [
		"C:\\Program Files\\Git\\bin\\bash.exe",
		"C:\\Program Files (x86)\\Git\\bin\\bash.exe",
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	return "bash";
}

/**
 * Windows 下用 taskkill 杀进程树（SIGTERM 在 Windows 上不可靠）。
 */
function killProcessTree(pid: number): void {
	if (process.platform === "win32") {
		try {
			spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
				stdio: "ignore",
				detached: true,
				windowsHide: true,
			});
		} catch {
			/* ignore */
		}
		return;
	}
	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			/* already dead */
		}
	}
}

function spawnAsync(
	command: string,
	cwd: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
	return new Promise((resolve, reject) => {
		const shell = findBash();

		const env = {
			...process.env,
			PYTHONUTF8: "1",
			PYTHONIOENCODING: "utf-8",
			TMPDIR: getTempDir(),
		};

		const child = spawn(shell, ["-c", command], {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env,
			windowsHide: true,
		});

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});

		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});

		const timer = setTimeout(() => {
			if (child.pid) killProcessTree(child.pid);
			reject(new Error(`command timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		if (signal) {
			const onAbort = () => {
				if (child.pid) killProcessTree(child.pid);
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

export function createBashTool(cwd: string): AgentTool<typeof Params, { message: string }> {
	const bashRules = loadBashPermissions();

	return {
		name: "bash",
		description: "执行 shell 命令并返回 stdout。timeout 超时后终止命令。输出超过 256K 字符自动截断。临时文件请保存到 $TMPDIR 目录（.vivlos/temp/）。",
		label: "运行命令",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
			signal?: AbortSignal,
		): Promise<AgentToolResult<{ message: string }>> {
			try {
				const perm = checkBashPermission(params.command, bashRules);
				if (!perm.allowed) {
					return {
						content: [{ type: "text", text: `Permission denied: ${perm.reason}` }],
						details: { message: `denied: ${params.command.slice(0, 80)}` },
					};
				}

				const timeoutMs = (params.timeout ?? 30) * 1000;

				const { stdout, stderr, code } = await spawnAsync(
					params.command,
					cwd,
					timeoutMs,
					signal,
				);

				if (code === null) {
					throw new Error("command killed (exit code: null)");
				}

				const combined = stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout;

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
