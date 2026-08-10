import { useState, useEffect } from "react";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { LLMConfigRepository } from "@vivlos/infra/storage/index.ts";
import { log } from "@vivlos/infra/logger/index.ts";

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
	/** 已指定的视觉模型（provider/modelId），未指定为 null */
	visionModelEntry: string | null;
	handleProviderSelect: (providerId: string) => Promise<void>;
	handleModelSelect: (entry: string) => void;
	/** 双击 g 指定/取消视觉模型（toggle） */
	handleSetVision: (entry: string) => void;
	handleApiKeySubmit: (key: string) => Promise<void>;
	handleCustomProviderSubmit: (config: {
		baseUrl: string;
		apiStandard: "openai" | "anthropic";
		modelId: string;
		apiKey: string;
		contextWindow?: number;
		vision?: boolean;
	}) => Promise<void>;
	setPopupState: (state: string) => void;
	setPendingProvider: (provider: string | null) => void;
}

/**
 * Provider 管理 hook -- 由 Workspace 使用的 provider/model 切换逻辑。
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
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
		state: "idle",
	});
	const [pendingProvider, setPendingProvider] = useState<string | null>(null);
	const [visionModelEntry, setVisionModelEntry] = useState<string | null>(
		() => llmConfigRepo.loadVisionModel() ?? null,
	);

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

			// 方案 A（对齐 pi-ai 的 checkAuth）：连接验证只确认"凭证已配置 + provider
			// 可解析出模型"，不再发送真实推理探测。token-plan 等 provider 的裸推理会撞上
			// 模型授权/配额/thinking 参数校验，导致有效 key 被误判为连接失败；key 的真实
			// 有效性交由第一条真实消息暴露。
			const envVar = `${providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
			const hasKey = (await llm.hasCredential(providerId)) || !!process.env[envVar];
			if (!hasKey) throw new Error("no api key configured");

			llm.setDefault(providerId, model.id);
			setCurrentLabel(`${truncate(providerId, 15)}/${model.id}`);
			setConnected(true);
			setConnectionStatus({ state: "success", provider: providerId });
			setTimeout(() => {
				setConnectionStatus({ state: "idle" });
				setPopupState("none");
			}, 3000);

			llmConfigRepo.saveConfig({
				defaultProvider: providerId,
				defaultModelId: model.id,
			});
			llmConfigRepo.addRecentProvider(providerId);
			llmConfigRepo.addRecentModel(`${providerId}/${model.id}`);
		} catch (err) {
			const customIds = llmConfigRepo.listCustomProviders();
			if (customIds.some((id) => id.startsWith(`${providerId}/`))) {
				llm.removeProvider(providerId);
				customIds
					.filter((id) => id.startsWith(`${providerId}/`))
					.forEach((id) => llmConfigRepo.removeCustomProvider(id));
			}
			setConnectionStatus({
				state: "failed",
				provider: providerId,
				error: err instanceof Error ? err.message : String(err),
			});
			setTimeout(() => setConnectionStatus({ state: "idle" }), 3000);
		}
	};

	const handleProviderSelect = async (providerId: string) => {
		if (providerId === "Custom") {
			setPopupState("custom");
			return;
		}
		if (providerId === llm.getDefaultProvider()) {
			setPopupState("none");
			return;
		}

		const hasKey = await llm.hasCredential(providerId);
		const envVar = `${providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
		if (!hasKey && !process.env[envVar]) {
			setPendingProvider(providerId);
			setPopupState("apikey");
			return;
		}

		const models = llm.listModels(providerId);
		const recentModels = llmConfigRepo.loadRecentModels();
		const lastUsedEntry = recentModels.find((e) =>
			e.startsWith(`${providerId}/`),
		);
		const lastUsedId = lastUsedEntry?.split("/")[1];
		const hasModel = lastUsedId && models.some((m) => m.id === lastUsedId);

		if (!hasModel) {
			llm.setDefault(providerId, models[0]?.id ?? "");
			setCurrentLabel(`${truncate(providerId, 15)}/${models[0]?.id ?? ""}`);
			llmConfigRepo.saveConfig({
				defaultProvider: providerId,
				defaultModelId: models[0]?.id ?? "",
			});
			llmConfigRepo.addRecentProvider(providerId);
			setPopupState("models");
			return;
		}

		llm.setDefault(providerId, lastUsedId!);
		setCurrentLabel(`${truncate(providerId, 15)}/${lastUsedId}`);
		llmConfigRepo.saveConfig({
			defaultProvider: providerId,
			defaultModelId: lastUsedId!,
		});
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
		baseUrl: string;
		apiStandard: "openai" | "anthropic";
		modelId: string;
		apiKey: string;
		contextWindow?: number;
		vision?: boolean;
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
		llmConfigRepo.saveConfig({
			defaultProvider: provider,
			defaultModelId: modelId,
		});
		llmConfigRepo.addRecentModel(entry);
	};

	const handleSetVision = (entry: string) => {
		if (visionModelEntry === entry) {
			llmConfigRepo.saveVisionModel(null);
			setVisionModelEntry(null);
			log("info", "已取消视觉模型指定，图片解析将使用主模型", undefined, true);
			return;
		}
		llmConfigRepo.saveVisionModel(entry);
		setVisionModelEntry(entry);
		log("info", `已指定视觉模型: ${entry}`, undefined, true);
	};

	return {
		currentLabel,
		connected,
		connectionStatus,
		pendingProvider,
		visionModelEntry,
		handleProviderSelect,
		handleModelSelect,
		handleSetVision,
		handleApiKeySubmit,
		handleCustomProviderSubmit,
		setPopupState,
		setPendingProvider,
	};
}
