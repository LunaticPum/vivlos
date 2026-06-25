// 执行 shell 命令并返回输出结果

import { spawn } from "child_process";
import type { ToolDefinition } from "../types.ts";

const MAX_OUTPUT_LENGTH = 100_000; // 最大输出字符数

export function createBashTool(cwd: string): ToolDefinition {
	return {
		name: "bash",
		description: "Execute a shell command. Returns stdout and stderr output.",
		parameters: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: "Shell command to execute",
				},
				timeout: {
					type: "number",
					description:
						"Timeout in seconds. Command will be killed if it exceeds this limit.",
				},
			},
			required: ["command"],
		},

		async execute(input, signal) {
			const { command, timeout } = input as {
				command: string;
				timeout?: number;
			};

			return new Promise<string>((resolve, reject) => {
				// spawn(command, args, options) 开启子进程执行 shell 命令
				const child = spawn(command, [], {
					cwd, // 子进程的工作目录
					shell: true, // 通过系统 shell 来解释命令
					stdio: ["ignore", "pipe", "pipe"], // 标准输入输出的配置，分别对应 stdin / stdout / stderr，这里 "ignore" 表示主进程不会给子进程输入任何东西
				});

				let stdout = "";
				let stderr = "";

				// 主进程接收子进程通过管道传输的二进制流并拼接为字符串
				child.stdout.on("data", (data: Buffer) => {
					stdout += data.toString();
				});
				child.stderr.on("data", (data: Buffer) => {
					stderr += data.toString();
				});

				// 超时处理
				let timeoutId: ReturnType<typeof setTimeout> | undefined;

				if (timeout) {
					timeoutId = setTimeout(() => {
						// 超时则杀死子进程，并拒绝接收该任务的后续结果
						child.kill();
						reject(new Error(`Command timed out after ${timeout}s`));
					}, timeout * 1000);
				}

				// 外部中止信号
				const onAbort = () => {
					child.kill();
					reject(new Error("Command aborted"));
				};

				signal?.addEventListener("abort", onAbort, { once: true }); // 用户按了 Ctrl + c 则发起一个 abort 事件；once: true表示该监听器是一次性监听器

				// 命令执行结束
				child.on("close", (exitCode) => {
					// 退出进程前及时关闭资源
					if (timeoutId) clearTimeout(timeoutId);
					if (signal) signal.removeEventListener("abort", onAbort);

					// 两种管道输出都要做超限截断，避免出现上下文被大量注入
					let output = stdout.slice(0, MAX_OUTPUT_LENGTH);
					let errorOutput = stderr.slice(0, MAX_OUTPUT_LENGTH);

					// 如果出现截断，对截断输出的文本内容尾部添加截断解释，以防歧义
					if (stdout.length > MAX_OUTPUT_LENGTH) {
						output += `\n... (output truncated, ${stdout.length - MAX_OUTPUT_LENGTH} more bytes)`;
					}
					if (stderr.length > MAX_OUTPUT_LENGTH) {
						errorOutput += `\n... (errorOutput truncated, ${stderr.length - MAX_OUTPUT_LENGTH} more bytes)`;
					}

					let result = `Exit code: ${exitCode}`;
					if (output) result += `\n\nStdout:\n${output}`;
					if (errorOutput) result += `\n\nStderr:\n${errorOutput}`;

					// 将结果传回调用方
					resolve(result);
				});

				child.on("error", (err) => {
					if (timeoutId) clearTimeout(timeoutId);
					if (signal) signal.removeEventListener("abort", onAbort);
					reject(err);
				});
			});
		},
	};
}
