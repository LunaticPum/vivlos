import { describe, it, expect } from "vitest";
import { createPromptBuilder } from "../prompt/builder.ts";

describe("createPromptBuilder", () => {
	it("使用默认值构建", () => {
		const builder = createPromptBuilder();
		const prompt = builder.build();

		expect(prompt).toContain("<identity>");
		expect(prompt).toContain("<environment>");
		expect(prompt).toContain("<runtime>");
		expect(prompt).toContain("<rules>");
	});

	it("自定义选项覆盖默认值", () => {
		const builder = createPromptBuilder({
			identity: "你是测试助手",
			rules: "规则1\n规则2",
		});
		const prompt = builder.build();

		expect(prompt).toContain("你是测试助手");
		expect(prompt).toContain("规则1");
		expect(prompt).toContain("规则2");
	});

	it("setMemory 和 setSkills 注入", () => {
		const builder = createPromptBuilder();
		builder.setMemory("记住用户喜欢简洁回答");
		builder.setSkills("可用技能：搜索");

		const prompt = builder.build();
		expect(prompt).toContain("记住用户喜欢简洁回答");
		expect(prompt).toContain("可用技能：搜索");
	});

	it("XML 标签存在", () => {
		const prompt = createPromptBuilder().build();
		expect(prompt).toContain("<identity>");
		expect(prompt).toContain("</identity>");
		expect(prompt).toContain("<environment>");
		expect(prompt).toContain("</environment>");
		expect(prompt).toContain("<rules>");
		expect(prompt).toContain("</rules>");
	});
});
