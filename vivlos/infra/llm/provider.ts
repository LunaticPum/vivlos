import type {
	MutableModels,
	Model,
	Api,
	Context,
	AssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
	createProvider,
	InMemoryCredentialStore,
} from "@earendil-works/pi-ai";
import type { ApiKeyCredential, CredentialStore } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import type { LLMClient, LLMConfig, CustomProviderConfig } from "./types.ts";

export type { LLMClient, LLMConfig, CustomProviderConfig } from "./types.ts";

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
	credentialStore?: CredentialStore,
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
			await store.modify(
				provider,
				async () =>
					({
						type: "api_key",
						key: apiKey,
					}) satisfies ApiKeyCredential,
			);
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

		// ── 自定义 provider ──

		addCustomProvider(config: CustomProviderConfig): string {
			let domain: string;
			try {
				domain = new URL(config.baseUrl).hostname;
			} catch {
				domain = config.baseUrl;
			}
			const providerId = domain;

			const apiType =
				config.apiStandard === "anthropic" ? "anthropic-messages" : "openai-completions";
			const apiWrapper =
				config.apiStandard === "anthropic" ? anthropicMessagesApi() : openAICompletionsApi();

			// contextWindow 优先级：用户指定 > pi-ai 查找 > 128k 默认
			const contextWindow = config.contextWindow
				?? models.getProviders().reduce<number | undefined>((found, p) =>
					found ?? models.getModels(p.id).find((m) => m.id === config.modelId)?.contextWindow,
					undefined,
				) ?? 128000;

			const newModel: Model<Api> = {
				id: config.modelId,
				name: config.modelId,
				api: apiType as Api,
				provider: providerId,
				baseUrl: config.baseUrl,
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow,
				maxTokens: 32000,
			};

			// 合并：同域名的已有 model 保留，新 model 追加（去重）
			const existingModels = models.getModels(providerId).filter((m) => m.id !== config.modelId);

			const provider = createProvider({
				id: providerId,
				name: providerId,
				baseUrl: config.baseUrl,
				auth: {
					apiKey: {
						name: `${domain} API Key`,
						resolve: async ({ credential }) => {
							if (credential?.type === "api_key" && credential.key) {
								return { auth: { apiKey: credential.key } };
							}
							return undefined;
						},
					},
				},
				models: [...existingModels, newModel],
				api: apiWrapper,
			});

			models.setProvider(provider);

			return providerId;
		},

		removeProvider(id: string): void {
			models.deleteProvider(id);
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
	const defaultProvider = process.env.VIVLOS_DEFAULT_PROVIDER ?? "deepseek";
	const defaultModelId =
		process.env.VIVLOS_DEFAULT_MODEL ?? "deepseek-v4-flash";

	return { defaultProvider, defaultModelId };
}
