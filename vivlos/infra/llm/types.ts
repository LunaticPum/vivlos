import type {
	Model,
	Context,
	AssistantMessageEventStream,
	Api,
} from "@earendil-works/pi-ai";

/**
 * pi-ai 薄封装
 */
export interface LLMClient {
	/** 按 provider + id 查找已配置的模型 */
	getModel(provider: string, id: string): Model<Api> | undefined;

	/** 列出所有已配置 provider 的模型 */
	listModels(): readonly Model<Api>[];

	/** 流式调用 */
	stream(
		model: Model<Api>,
		context: Context,
		options?: { signal?: AbortSignal },
	): AssistantMessageEventStream;
}

export interface LLMConfig {
	/** 默认 provider id（如 "openai"） */
	defaultProvider: string;
	/** 默认 model id（如 "gpt-4o"） */
	defaultModelId: string;
}
