import { describe, it, expect } from "vitest";
import { createPromptBuilder } from "../prompt/builder.ts";
import {
	DEFAULT_IDENTITY,
	DEFAULT_RULES,
	buildEnvironment,
} from "../prompt/templates.ts";

describe("createPromptBuilder", () => {
	it("使用默认值构建", () => {
		const builder = createPromptBuilder();
		const prompt = builder.build();

		expect(prompt).toContain(DEFAULT_IDENTITY);
		expect(prompt).toContain(buildEnvironment());
		expect(prompt).toContain(DEFAULT_RULES);
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
		expect(prompt).not.toContain(DEFAULT_IDENTITY);
	});

	it("setMemory 和 setSkills 注入", () => {
		const builder = createPromptBuilder();
		builder.setMemory("记住用户喜欢简洁回答");
		builder.setSkills("可用技能：搜索");

		const prompt = builder.build();
		expect(prompt).toContain("记住用户喜欢简洁回答");
		expect(prompt).toContain("可用技能：搜索");
	});

	it("分隔符 --- 存在", () => {
		const prompt = createPromptBuilder().build();
		expect(prompt).toContain("---");
	});
});
