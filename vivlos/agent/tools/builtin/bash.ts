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
		Type.Number({
			description: "超时时间（秒），默认 30 秒",
			exclusiveMinimum: 0,
		}),
	),
});

type Params = Static<typeof Params>;

const MAX_CHARS = 256 * 1024;
const MAX_STREAM_CHARS = MAX_CHARS / 2;
const KILL_GRACE_MS = 2_000;

interface BashOutput {
	stdout: string;
	stderr: string;
	code: number | null;
	truncated: boolean;
}

interface BashDetails {
	message: string;
	exitCode: number;
	outputChars: number;
	truncated: boolean;
}

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

function forceKillProcessTree(pid: number): void {
	if (process.platform === "win32") {
		killProcessTree(pid);
		return;
	}
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		try {
			process.kill(pid, "SIGKILL");
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
): Promise<BashOutput> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("aborted"));
			return;
		}
		const shell = findBash();

		const env = {
			...process.env,
			PYTHONUTF8: "1",
			PYTHONIOENCODING: "utf-8",
			TMPDIR: getTempDir(),
		};

		const child = spawn(shell, ["-c", command], {
			cwd,
			detached: process.platform !== "win32",
			stdio: ["pipe", "pipe", "pipe"],
			env,
			windowsHide: true,
		});

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");

		let stdout = "";
		let stderr = "";
		let truncated = false;
		let terminalError: Error | undefined;
		let killFallback: ReturnType<typeof setTimeout> | undefined;
		let settled = false;

		child.stdout.on("data", (chunk: string) => {
			const next = appendBoundedTail(stdout, chunk);
			stdout = next.text;
			truncated ||= next.truncated;
		});

		child.stderr.on("data", (chunk: string) => {
			const next = appendBoundedTail(stderr, chunk);
			stderr = next.text;
			truncated ||= next.truncated;
		});

		const cleanup = () => {
			clearTimeout(timer);
			if (killFallback) clearTimeout(killFallback);
			signal?.removeEventListener("abort", onAbort);
		};
		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			fn();
		};
		const terminate = (error: Error) => {
			if (terminalError) return;
			terminalError = error;
			if (child.pid) killProcessTree(child.pid);
			killFallback = setTimeout(
				() => {
					if (child.pid) forceKillProcessTree(child.pid);
					settle(() => reject(withCommandOutput(error, stdout, stderr, truncated)));
				},
				KILL_GRACE_MS,
			);
		};
		const onAbort = () => terminate(new Error("aborted"));
		const timer = setTimeout(
			() => terminate(new Error(`command timed out after ${timeoutMs}ms`)),
			timeoutMs,
		);

		signal?.addEventListener("abort", onAbort, { once: true });

		child.on("close", (code) => {
			settle(() => terminalError
				? reject(withCommandOutput(terminalError, stdout, stderr, truncated))
				: resolve({ stdout, stderr, code, truncated }));
		});

		child.on("error", (err) => {
			settle(() => reject(err));
		});
	});
}

export function createBashTool(cwd: string): AgentTool<typeof Params, BashDetails> {
	const bashRules = loadBashPermissions();

	return {
		name: "bash",
		description: "在当前工作目录执行 shell 命令并返回 stdout 和 stderr。默认 30 秒超时，两个输出流各保留末尾 128K 字符。",
		label: "运行命令",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
			signal?: AbortSignal,
		): Promise<AgentToolResult<BashDetails>> {
			try {
				const perm = checkBashPermission(params.command, bashRules);
				if (!perm.allowed) {
					throw new ToolError(`Permission denied: ${perm.reason}`, "bash");
				}

				const timeoutMs = (params.timeout ?? 30) * 1000;

				const { stdout, stderr, code, truncated } = await spawnAsync(
					params.command,
					cwd,
					timeoutMs,
					signal,
				);

				if (code === null) {
					throw withCommandOutput(
						new Error("command killed (exit code: null)"),
						stdout,
						stderr,
						truncated,
					);
				}

				const combined = formatOutput(stdout, stderr, truncated);
				if (code !== 0) {
					throw new Error(`${combined}\n\nCommand exited with code ${code}`);
				}

				return {
					content: [{ type: "text", text: combined }],
					details: {
						message: `exit ${code} (${stdout.length + stderr.length} chars)`,
						exitCode: code,
						outputChars: stdout.length + stderr.length,
						truncated,
					},
				};
			} catch (err) {
				if (err instanceof ToolError) throw err;
				const cause = err instanceof Error ? err : new Error(String(err));
				throw new ToolError(cause.message, "bash", cause);
			}
		},
	};
}

function appendBoundedTail(current: string, chunk: string): { text: string; truncated: boolean } {
	const combined = current + chunk;
	return combined.length > MAX_STREAM_CHARS
		? { text: combined.slice(-MAX_STREAM_CHARS), truncated: true }
		: { text: combined, truncated: false };
}

function formatOutput(stdout: string, stderr: string, truncated: boolean): string {
	const combined = stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout;
	const notice = truncated ? "\n...[earlier output truncated]" : "";
	return (combined || "(no output)") + notice;
}

function withCommandOutput(
	error: Error,
	stdout: string,
	stderr: string,
	truncated: boolean,
): Error {
	return new Error(`${formatOutput(stdout, stderr, truncated)}\n\n${error.message}`, {
		cause: error,
	});
}
