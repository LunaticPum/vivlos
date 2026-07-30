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
import { description as taskDescription } from "@vivlos/agent/tools/advanced/task/description.ts";
import { description as todoDescription } from "@vivlos/agent/tools/advanced/todo/description.ts";
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
		expect(memoryDescription).toContain("当前 Session 的 L1 Memory");
		expect(memoryDescription).toContain("稳定的项目环境、事实、决策、约定、用户偏好");
		expect(memoryDescription).toContain("committed");
		expect(memoryDescription).toContain("不会被其他或未来 Session 自动继承");
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
			expect(description).toContain("不得用于");
			expect(description).toContain("Vivlos Memory");
		}
		expect(taskDescription).toContain("稳定事实、环境或用户偏好（用 memory 代替）");
		expect(taskDescription).not.toContain("记住这个目标");
		expect(todoDescription).toContain("稳定事实、环境或用户偏好（用 memory 代替）");
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
