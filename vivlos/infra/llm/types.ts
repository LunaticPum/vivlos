import type {
	Model,
	Context,
	AssistantMessageEventStream,
	Api,
	ThinkingLevel,
} from "@earendil-works/pi-ai";

/**
 * pi-ai 薄封装 — LLM 客户端接口。
 *
 * 封装模型查询、流式调用、凭证管理、默认 provider/model 切换。
 * 后续 TUI /model 命令通过此接口实现动态模型切换。
 */
export interface LLMClient {
	// ── 模型查询 ──

	/** 按 provider + modelId 查找模型 */
	getModel(provider: string, id: string): Model<Api> | undefined;

	/** 列出所有已注册的模型（所有 provider） */
	listModels(provider?: string): readonly Model<Api>[];

	/** 列出所有已注册 provider 的 id */
	listProviders(): string[];

	// ── 流式调用 ──

	stream(
		model: Model<Api>,
		context: Context,
		options?: { signal?: AbortSignal; reasoning?: ThinkingLevel },
	): AssistantMessageEventStream;

	// ── 凭证管理（/model 命令使用） ──

	/** 设置指定 provider 的 API key（会存入 CredentialStore，下次 getAuth 自动读取） */
	setCredential(provider: string, apiKey: string): Promise<void>;

	/** 检查指定 provider 是否已配置 key */
	hasCredential(provider: string): Promise<boolean>;

	// ── 默认模型切换 ──

	/** 获取当前默认 provider id */
	getDefaultProvider(): string;

	/** 获取当前默认 modelId */
	getDefaultModelId(): string;

	/** 设置默认 provider + modelId（/model 选择后调用） */
	setDefault(provider: string, modelId: string): void;
}

/**
 * LLM 配置（provider + 默认模型）。
 *
 * 后续持久化到 SQLite，启动时读 "llm:config" 条目恢复。
 */
export interface LLMConfig {
	defaultProvider: string;
	defaultModelId: string;
}