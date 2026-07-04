import type {
	MutableModels,
	Model,
	Api,
	Context,
	AssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { LLMClient, LLMConfig } from "./types.ts";

export type { LLMClient, LLMConfig } from "./types.ts";

/**
 * 创建 LLM 客户端。
 *
 * 封装 pi-ai 的 builtinModels()，从环境变量读配置。
 * agent 层通过这个接口拿模型、调 LLM，
 */
export function createLLM(config: LLMConfig): LLMClient {
	const models: MutableModels = builtinModels();

	return {
		getModel(provider, id) {
			return models.getModel(provider, id);
		},

		listModels() {
			return models.getModels();
		},

		stream(model, context, options) {
			return models.streamSimple(model, context, { signal: options?.signal });
		},
	};
}

/**
 * 从环境变量构造 LLMConfig。
 *
 * .env 里需要：
 *   OPENAI_API_KEY=sk-...
 *   # 可选：
 *   # OPENAI_BASE_URL=https://...
 *   # VIVLOS_DEFAULT_PROVIDER=openai
 *   # VIVLOS_DEFAULT_MODEL=gpt-4o
 */
export function loadLLMConfigFromEnv(): LLMConfig {
	const defaultProvider = process.env.VIVLOS_DEFAULT_PROVIDER ?? "openai";
	const defaultModelId = process.env.VIVLOS_DEFAULT_MODEL ?? "gpt-4o";

	return { defaultProvider, defaultModelId };
}
