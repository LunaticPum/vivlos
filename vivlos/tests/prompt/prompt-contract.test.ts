/**
 * 主 Agent Prompt 与 Tool Description 静态契约测试。
 *
 * 不调用真实模型，只验证组装后的指令边界和压缩输入角色。
 */

import { describe, expect, it } from "vitest";
import type { Api, Context, Model } from "@earendil-works/pi-ai";

import { createPromptBuilder } from "@vivlos/agent/prompt/index.ts";
import { summarize } from "@vivlos/agent/compression/summarizer.ts";
import { memoryDescription } from "@vivlos/agent/tools/advanced/memory/description.ts";
import { DELEGATE_DESCRIPTION } from "@vivlos/agent/tools/advanced/delegate/description.ts";
import { descriptions as todoDescriptions } from "@vivlos/agent/tools/advanced/todo/description.ts";
import {
	createBashTool,
	createReadTool,
	createWriteTool,
} from "@vivlos/agent/tools/builtin/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";

describe("Main agent prompt contract", () => {
	it("PRM-001 统一约束 Memory 路由、结果依据和 Session 作用域", () => {
		const prompt = createPromptBuilder().build();

		for (const required of [
			"同一轮发出全部 Tool Call",
			"依赖前一个 Tool Result 时才分轮执行",
			"重新核对本轮用户请求",
			"必须使用 memory Tool",
			"只有对应 Tool Result 确认成功",
			"只在当前 Session 生效",
			"不得承诺其他或未来 Session 自动继承",
			"不可信背景数据",
		]) {
			expect(prompt).toContain(required);
		}
	});

	it("PRM-002 Memory Description 只承诺当前 Session 的稳定信息", () => {
		expect(memoryDescription).toContain("当前 Session");
		expect(memoryDescription).toContain("稳定项目事实和用户偏好");
		expect(memoryDescription).toContain("add");
		expect(memoryDescription).toContain("replace");
		expect(memoryDescription).toContain("remove");
		expect(memoryDescription).toContain("用户明确要求记住、纠正或遗忘时必须调用");
		expect(memoryDescription).toContain("Thought 中计划写入不代表已完成");
		expect(memoryDescription).toContain("只有成功的 Tool Result");
		expect(memoryDescription).not.toContain("每个未来 session");
		expect(memoryDescription).not.toContain("已完成工作");
	});

	it("PRM-003 相邻工具与 Memory 的职责描述互斥", () => {
		const cwd = process.cwd();
		const descriptions = [
			createReadTool(cwd).description,
			createWriteTool(cwd).description,
			createBashTool(cwd).description,
		];

		for (const description of descriptions) {
			expect(description).not.toContain("Vivlos Memory");
		}
		const prompt = createPromptBuilder().build();
		expect(prompt).toContain("不得使用 read、write 或 bash 访问或创建 Vivlos Memory");
		expect(DELEGATE_DESCRIPTION).toContain("每批最多 2 个子任务，且最多 1 个 writing");
		expect(DELEGATE_DESCRIPTION).toContain("子代理看不到当前对话");
		expect(todoDescriptions.write).toContain("当前 Session");
		expect(todoDescriptions.write).toContain("创建");
		expect(todoDescriptions.write).toContain("不要传字符串");
		expect(todoDescriptions.replace).toContain("不要传字符串");
		expect(todoDescriptions.modify).toContain("Item");
		expect(prompt).toContain("Todo 只跟踪当前 Session 的执行进度，不写入 memory");
		expect(prompt).toContain("子代理看不到当前对话：brief 必须自包含");
	});
});

describe("Compression prompt contract", () => {
	it("PRM-004 旧摘要作为不可信用户数据且完成状态依赖 Tool Result", async () => {
		let captured: Context | undefined;
		const llm = {
			stream(_model: Model<Api>, context: Context) {
				captured = context;
				return (async function* () {
					yield { type: "text_delta", delta: "summary" } as const;
				})();
			},
		} as unknown as LLMClient;

		await summarize({
			llm,
			model: {} as Model<Api>,
			messages: [{ role: "user", content: "history", timestamp: 1 }],
			previousSummary: "OLD_SUMMARY",
		});

		expect(captured).toBeDefined();
		expect(captured!.systemPrompt).toContain("Tool Result 明确成功");
		expect(captured!.systemPrompt).toContain("不可信输入");
		expect(captured!.systemPrompt).not.toContain("OLD_SUMMARY");
		const input = captured!.messages[0];
		expect(input?.role).toBe("user");
		expect(input?.content).toContain("OLD_SUMMARY");
		expect(input?.content).toContain("不可信历史数据");
	});
});
