// vivlos/infra/llm/provider.test.ts
import { describe, it, expect } from "vitest";
import { createLLM, loadLLMConfigFromEnv } from "../provider.js";

describe("createLLM", () => {
	it("返回 LLMClient 接口", () => {
		const client = createLLM({
			defaultProvider: "openai",
			defaultModelId: "gpt-4o",
		});
		expect(typeof client.getModel).toBe("function");
		expect(typeof client.listModels).toBe("function");
		expect(typeof client.stream).toBe("function");
	});

	it("listModels 返回数组", () => {
		const client = createLLM({
			defaultProvider: "openai",
			defaultModelId: "gpt-4o",
		});
		const models = client.listModels();
		expect(Array.isArray(models)).toBe(true);
	});
});

describe("loadLLMConfigFromEnv", () => {
	it("使用默认值", () => {
		// 确保环境变量干净
		const origProvider = process.env.VIVLOS_DEFAULT_PROVIDER;
		const origModel = process.env.VIVLOS_DEFAULT_MODEL;
		delete process.env.VIVLOS_DEFAULT_PROVIDER;
		delete process.env.VIVLOS_DEFAULT_MODEL;

		const config = loadLLMConfigFromEnv();
		expect(config.defaultProvider).toBe("openai");
		expect(config.defaultModelId).toBe("gpt-4o");

		// 恢复
		if (origProvider) process.env.VIVLOS_DEFAULT_PROVIDER = origProvider;
		if (origModel) process.env.VIVLOS_DEFAULT_MODEL = origModel;
	});

	it("读取环境变量覆盖", () => {
		process.env.VIVLOS_DEFAULT_PROVIDER = "anthropic";
		process.env.VIVLOS_DEFAULT_MODEL = "claude-sonnet-4-20250514";

		const config = loadLLMConfigFromEnv();
		expect(config.defaultProvider).toBe("anthropic");
		expect(config.defaultModelId).toBe("claude-sonnet-4-20250514");

		// 清理
		delete process.env.VIVLOS_DEFAULT_PROVIDER;
		delete process.env.VIVLOS_DEFAULT_MODEL;
	});
});
