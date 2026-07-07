import type {
	MutableModels,
	Model,
	Api,
	Context,
	AssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all.ts";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import type { ApiKeyCredential } from "@earendil-works/pi-ai";
import type { LLMClient, LLMConfig } from "./types.ts";

export type { LLMClient, LLMConfig } from "./types.ts";

/**
 * 创建 LLM 客户端。
 *
 * 封装 pi-ai 的 builtinModels()，持有 InMemoryCredentialStore 用于运行时
 * /model 命令的凭证注入。
 *
 * @param config 默认 provider + modelId
 * @param credentialStore 外部传入的 credential store（可选）
 *   不传则内部创建新的——运行时注入的 key 仅本次进程有效。
 *   后续 P7 持久化时传入 SQLite-backed CredentialStore 实现。
 */
export function createLLM(
	config: LLMConfig,
	credentialStore?: InMemoryCredentialStore,
): LLMClient {
	const store = credentialStore ?? new InMemoryCredentialStore();
	const models: MutableModels = builtinModels({ credentials: store });

	// 默认 provider + modelId，可被 setDefault() 运行时覆盖
	let defaultProvider = config.defaultProvider;
	let defaultModelId = config.defaultModelId;

	return {
		// ── 模型查询 ──

		getModel(provider, id) {
			return models.getModel(provider, id);
		},

		listModels(provider) {
			return models.getModels(provider);
		},

		listProviders() {
			return models.getProviders().map((p) => p.id);
		},

		// ── 流式调用 ──

		stream(model, context, options) {
			return models.streamSimple(model, context, {
				signal: options?.signal,
				reasoning: options?.reasoning,
			});
		},

		// ── 凭证管理 ──

		async setCredential(provider, apiKey) {
			await store.modify(provider, async () => ({
				type: "api_key",
				key: apiKey,
			} satisfies ApiKeyCredential));
		},

		async hasCredential(provider) {
			const cred = await store.read(provider);
			return cred?.type === "api_key" && cred.key !== undefined;
		},

		// ── 默认模型切换 ──

		getDefaultProvider() {
			return defaultProvider;
		},

		getDefaultModelId() {
			return defaultModelId;
		},

		setDefault(provider, modelId) {
			defaultProvider = provider;
			defaultModelId = modelId;
		},
	};
}

/**
 * 从环境变量构造 LLMConfig。
 *
 * .env 里需要：
 *   VIVLOS_DEFAULT_PROVIDER  — 默认 provider（默认 "deepseek"）
 *   VIVLOS_DEFAULT_MODEL     — 默认 modelId（默认 "deepseek-v4-flash"）
 */
export function loadLLMConfigFromEnv(): LLMConfig {
	const defaultProvider =
		process.env.VIVLOS_DEFAULT_PROVIDER ?? "deepseek";
	const defaultModelId =
		process.env.VIVLOS_DEFAULT_MODEL ?? "deepseek-v4-flash";

	return { defaultProvider, defaultModelId };
}