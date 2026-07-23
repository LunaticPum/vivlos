import { useState, useCallback, useEffect } from "react";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { LLMConfigRepository } from "@vivlos/infra/storage/index.ts";

export type ConnectionStatus =
	| { state: "idle" }
	| { state: "connecting"; provider: string }
	| { state: "success"; provider: string }
	| { state: "failed"; provider: string; error?: string };

function truncate(s: string, max: number): string {
	return s.length > max ? `${s.slice(0, max)}...` : s;
}

export interface ProviderManagerResult {
	currentLabel: string;
	connected: boolean;
	connectionStatus: ConnectionStatus;
	pendingProvider: string | null;
	handleProviderSelect: (providerId: string) => Promise<void>;
	handleModelSelect: (entry: string) => void;
	handleApiKeySubmit: (key: string) => Promise<void>;
	handleCustomProviderSubmit: (config: {
		baseUrl: string;
		apiStandard: "openai" | "anthropic";
		modelId: string;
		apiKey: string;
		contextWindow?: number;
	}) => Promise<void>;
	setPopupState: (state: string) => void;
	setPendingProvider: (provider: string | null) => void;
}

/**
 * Provider 管理 hook -- 从 ChatPanel 抽取的 provider/model 切换逻辑。
 *
 * 职责：
 * - provider 选择（检查凭证 -> 直切 / 弹 apikey / 弹 models）
 * - API key 输入 + 连接验证
 * - 自定义 provider 注册 + 验证
 * - model 选择
 */
export function useProviderManager(
	llm: LLMClient,
	llmConfigRepo: LLMConfigRepository,
	initialLabel: string,
	popupStateSetter: (state: string) => void,
): ProviderManagerResult {
	const [currentLabel, setCurrentLabel] = useState(initialLabel);
	const [connected, setConnected] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ state: "idle" });
	const [pendingProvider, setPendingProvider] = useState<string | null>(null);

	// 启动时检查默认 provider 是否已配置 API key
	useEffect(() => {
		const provider = llm.getDefaultProvider();
		const envVar = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
		llm.hasCredential(provider).then((hasInStore) => {
			setConnected(hasInStore || !!process.env[envVar]);
		});
	}, [llm]);

	const setPopupState = popupStateSetter;

	const verifyAndSwitch = async (providerId: string) => {
		setPopupState("none");
		setConnectionStatus({ state: "connecting", provider: providerId });

		try {
			const model = llm.listModels(providerId)[0];
			if (!model) throw new Error("no models available");

			const stream = llm.stream(
				model,
				{ messages: [{ role: "user", content: "hi", timestamp: Date.now() }] },
				{ signal: AbortSignal.timeout(15000) },
			);
			for await (const event of stream) {
				if (event.type === "error") throw new Error(event.error.errorMessage ?? "connect failed");
				if (event.type === "text_delta") break;
			}

			llm.setDefault(providerId, model.id);
			setCurrentLabel(`${truncate(providerId, 15)}/${model.id}`);
			setConnected(true);
			setConnectionStatus({ state: "success", provider: providerId });
			setTimeout(() => { setConnectionStatus({ state: "idle" }); setPopupState("none"); }, 3000);

			llmConfigRepo.saveConfig({ defaultProvider: providerId, defaultModelId: model.id });
			llmConfigRepo.addRecentProvider(providerId);
			llmConfigRepo.addRecentModel(`${providerId}/${model.id}`);
		} catch (err) {
			const customIds = llmConfigRepo.listCustomProviders();
			if (customIds.some((id) => id.startsWith(`${providerId}/`))) {
				llm.removeProvider(providerId);
				customIds.filter((id) => id.startsWith(`${providerId}/`)).forEach((id) => llmConfigRepo.removeCustomProvider(id));
			}
			setConnectionStatus({ state: "failed", provider: providerId, error: err instanceof Error ? err.message : String(err) });
			setTimeout(() => setConnectionStatus({ state: "idle" }), 3000);
		}
	};

	const handleProviderSelect = async (providerId: string) => {
		if (providerId === "Custom") { setPopupState("custom"); return; }
		if (providerId === llm.getDefaultProvider()) { setPopupState("none"); return; }

		const hasKey = await llm.hasCredential(providerId);
		const envVar = `${providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
		if (!hasKey && !process.env[envVar]) {
			setPendingProvider(providerId);
			setPopupState("apikey");
			return;
		}

		const models = llm.listModels(providerId);
		const recentModels = llmConfigRepo.loadRecentModels();
		const lastUsedEntry = recentModels.find((e) => e.startsWith(`${providerId}/`));
		const lastUsedId = lastUsedEntry?.split("/")[1];
		const hasModel = lastUsedId && models.some((m) => m.id === lastUsedId);

		if (!hasModel) {
			llm.setDefault(providerId, models[0]?.id ?? "");
			setCurrentLabel(`${truncate(providerId, 15)}/${models[0]?.id ?? ""}`);
			llmConfigRepo.saveConfig({ defaultProvider: providerId, defaultModelId: models[0]?.id ?? "" });
			llmConfigRepo.addRecentProvider(providerId);
			setPopupState("models");
			return;
		}

		llm.setDefault(providerId, lastUsedId!);
		setCurrentLabel(`${truncate(providerId, 15)}/${lastUsedId}`);
		llmConfigRepo.saveConfig({ defaultProvider: providerId, defaultModelId: lastUsedId! });
		llmConfigRepo.addRecentProvider(providerId);
		llmConfigRepo.addRecentModel(`${providerId}/${lastUsedId}`);
		setPopupState("none");
	};

	const handleApiKeySubmit = async (key: string) => {
		if (!pendingProvider) return;
		await llm.setCredential(pendingProvider, key);
		const provider = pendingProvider;
		setPendingProvider(null);
		await verifyAndSwitch(provider);
	};

	const handleCustomProviderSubmit = async (config: {
		baseUrl: string; apiStandard: "openai" | "anthropic"; modelId: string; apiKey: string; contextWindow?: number;
	}) => {
		const providerId = llm.addCustomProvider(config);
		llmConfigRepo.saveCustomProvider(`${providerId}/${config.modelId}`, config);
		await llm.setCredential(providerId, config.apiKey);
		await verifyAndSwitch(providerId);
	};

	const handleModelSelect = (entry: string) => {
		const [provider, modelId] = entry.split("/");
		llm.setDefault(provider, modelId);
		setCurrentLabel(`${truncate(provider, 15)}/${modelId}`);
		setPopupState("none");
		llmConfigRepo.saveConfig({ defaultProvider: provider, defaultModelId: modelId });
		llmConfigRepo.addRecentModel(entry);
	};

	return {
		currentLabel,
		connected,
		connectionStatus,
		pendingProvider,
		handleProviderSelect,
		handleModelSelect,
		handleApiKeySubmit,
		handleCustomProviderSubmit,
		setPopupState,
		setPendingProvider,
	};
}
