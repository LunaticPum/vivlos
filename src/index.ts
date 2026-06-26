// CLI 入口——组装所有模块，接收用户输入并运行 Agent

import "dotenv/config";
import { OpenAIProvider } from "./llm/openai.ts";
import { ToolRegistry } from "./tools/registry.ts";
import { createReadTool } from "./tools/read.ts";
import { createWriteTool } from "./tools/write.ts";
import { createEditTool } from "./tools/edit.ts";
import { createBashTool } from "./tools/bash.ts";
import { AgentSession } from "./agent/session.ts";

async function main() {
	const cwd = process.cwd(); // 获取主进程的工作目录

	const provider = new OpenAIProvider("https://api.deepseek.com");

	const registry = new ToolRegistry();
	registry.register(createReadTool(cwd));
	registry.register(createWriteTool(cwd));
	registry.register(createEditTool(cwd));
	registry.register(createBashTool(cwd));

	const session = new AgentSession({
		provider,
		registry,
		model: "deepseek-v4-flash",
	});

	// argv 获取命令行参数数组，其中 argv[0] 和 argv[1] 分别是 Node.js 可执行文件路径和当前脚本路径，从 argv[2] 往后都是用户输入参数
	const input = process.argv.slice(2).join(" ");
	if (!input) {
		console.error("使用方式: npx tsx src/index.ts <提问消息>");
		process.exit(1); // 退出码非零，表示进程异常退出，如果退出码 = 2，则表示进程被系统 SIGINT 信号中断（用户按 ctrl + c）
	}

	console.log(`\n少女祈祷中...`);
	const response = await session.prompt(input);
	console.log(response);
}

// 全局未捕获异常兜底处理
main().catch((err) => {
	console.error("错误:", err instanceof Error ? err.message : String(err));
	process.exit(1);
});
