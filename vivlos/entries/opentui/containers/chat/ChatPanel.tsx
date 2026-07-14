/**
 * Chat - 对话区整体容器
 *
 * 组装 ChatArea / StatusBar / InputBar / InfoBar 四个分区，
 * 内部管理：
 * - useAgent 状态（对话轮次、loading、error）
 * - /detail 展开切换
 * - slash 命令系统（registry + checkCommand）
 * - provider/model 弹窗（models / providers / apikey / custom）
 * - API Key 连接验证（connecting -> success/failed）
 * - 自定义 provider 配置（CustomProviderPopup）
 * - 帮助弹窗（Ctrl+O）
 * - 未知指令错误（commandError，3s 自动消失）
 */

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { ChatArea } from "./ChatArea";
import { StatusBar, type ConnectionStatus } from "./StatusBar";
import { InputBar } from "./InputBar";
import { InfoBar } from "./InfoBar";
import { SelectionPopup } from "../../components/popups/SelectionPopup";
import { ApiKeyPopup } from "../../components/popups/ApiKeyPopup";
import { HelpPopup } from "../../components/popups/HelpPopup";
import { CustomProviderPopup } from "../../components/popups/CustomProviderPopup";
import { useAgent } from "../../hooks/useAgent";
import {
	createTUICommandRegistry,
	type TUICommandRegistry,
} from "../../commands/registry";
import { registerBuiltinCommands } from "../../commands/builtin";
import { checkCommand } from "../../commands/check";
import type { CommandContext } from "../../commands/types";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";

export interface ChatProps {
	modelLabel: string;
	agent: VivlosAgent;
	eventBus: EventBus;
	llm: LLMClient;
}

type PopupState = "none" | "models" | "providers" | "apikey" | "custom";

export function Chat({ modelLabel, agent, eventBus, llm }: ChatProps) {
	const { conversationTurns, loading, error, submit, abort } = useAgent(
		agent,
		eventBus,
	);

	const [detailExpanded, setDetailExpanded] = useState(false);
	const [popupState, setPopupState] = useState<PopupState>("none");
	const [showHelp, setShowHelp] = useState(false);
	const [currentLabel, setCurrentLabel] = useState(modelLabel);
	const [pendingProvider, setPendingProvider] = useState<string | null>(null);
	const [commandError, setCommandError] = useState<string | null>(null);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
		state: "idle",
	});
	const [connected, setConnected] = useState(false);

	// ── 启动时检查默认 provider 是否已配置 API key ──
	// 同时检查环境变量和 credential store
	useEffect(() => {
		const provider = llm.getDefaultProvider();
		const envVar = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
		llm.hasCredential(provider).then((hasInStore) => {
			setConnected(hasInStore || !!process.env[envVar]);
		});
	}, [llm]);

	// ── 命令注册表（懒初始化）──
	const registryRef = useRef<TUICommandRegistry | null>(null);
	if (registryRef.current === null) {
		registryRef.current = createTUICommandRegistry();
		registerBuiltinCommands(registryRef.current);
	}
	const registry = registryRef.current;

	// ── 命令上下文（回调注入 UI 状态变更）──
	const cmdCtx = useMemo<CommandContext>(
		() => ({
			openModels: () => setPopupState("models"),
			openProviders: () => setPopupState("providers"),
			toggleDetail: () => setDetailExpanded((v) => !v),
			showHelp: () => setShowHelp(true),
		}),
		[],
	);

	// ── 未知指令错误（3s 自动消失）──
	const showCommandError = useCallback((msg: string) => {
		setCommandError(msg);
		setTimeout(() => setCommandError(null), 3000);
	}, []);

	// ── InputBar 提交：走 checkCommand 派发 ──
	const handleSubmit = useCallback(
		(text: string) => {
			const result = checkCommand(text, registry, cmdCtx);
			if (!result.handled) {
				submit(text);
				return;
			}
			if (result.error) {
				showCommandError(result.error);
			}
		},
		[registry, cmdCtx, submit, showCommandError],
	);

	const hasCompletedConversation = conversationTurns.some(
		(t) => t.status === "complete",
	);

	const lastStatus =
		conversationTurns.length > 0
			? conversationTurns[conversationTurns.length - 1]!.status
			: undefined;

	// ── provider 选择 ──
	const handleProviderSelect = async (providerId: string) => {
		// Custom 选项 -> 打开自定义 provider 表单
		if (providerId === "Custom") {
			setPopupState("custom");
			return;
		}
		// 没切换 provider，直接关闭
		if (providerId === llm.getDefaultProvider()) {
			setPopupState("none");
			return;
		}
		// 检查是否有 API key
		const hasKey = await llm.hasCredential(providerId);
		if (!hasKey) {
			setPendingProvider(providerId);
			setPopupState("apikey");
			return;
		}
		// 有 key，验证连接
		await verifyAndSwitch(providerId);
	};

	// ── API Key 连接验证 + 切换（3s 超时）──
	const verifyAndSwitch = async (providerId: string) => {
		setPopupState("none");
		setConnectionStatus({ state: "connecting", provider: providerId });

		try {
			const models = llm.listModels(providerId);
			const model = models[0];
			if (!model) throw new Error("no models available");

			// 最小请求测试连接：等到收到实际文本或错误事件，3s 超时
			const stream = llm.stream(
				model,
				{ messages: [{ role: "user", content: "hi", timestamp: Date.now() }] },
				{ signal: AbortSignal.timeout(15000) },
			);
			for await (const event of stream) {
				if (event.type === "error") {
					throw new Error(event.error.errorMessage ?? "connect failed");
				}
				if (event.type === "text_delta") {
					break; // 收到实际响应 = 连接正常
				}
			}

			// 验证成功
			llm.setDefault(providerId, model.id);
			setCurrentLabel(`${providerId}/${model.id}`);
			setConnected(true);
			setConnectionStatus({ state: "success", provider: providerId });
			setTimeout(() => {
				setConnectionStatus({ state: "idle" });
				setPopupState("models");
			}, 3000);
		} catch (err) {
			// 连接失败：如果是自定义 provider，从列表中移除
			if (providerId.startsWith("[custom] ")) {
				llm.removeProvider(providerId);
			}
			const errorMsg = err instanceof Error ? err.message : String(err);
			setConnectionStatus({
				state: "failed",
				provider: providerId,
				error: errorMsg,
			});
			setTimeout(() => setConnectionStatus({ state: "idle" }), 3000);
		}
	};

	// ── API key 输入完成 ──
	const handleApiKeySubmit = async (key: string) => {
		if (!pendingProvider) return;
		await llm.setCredential(pendingProvider, key);
		const provider = pendingProvider;
		setPendingProvider(null);
		await verifyAndSwitch(provider);
	};

	// ── 自定义 provider 提交 -- 注册 + 连接验证 ──
	const handleCustomProviderSubmit = async (config: {
		baseUrl: string;
		apiStandard: "openai" | "anthropic";
		modelId: string;
		apiKey: string;
	}) => {
		const providerId = llm.addCustomProvider(config);
		await llm.setCredential(providerId, config.apiKey);
		await verifyAndSwitch(providerId);
	};

	// ── model 选择 ──
	const handleModelSelect = (modelId: string) => {
		const provider = llm.getDefaultProvider();
		llm.setDefault(provider, modelId);
		setCurrentLabel(`${provider}/${modelId}`);
		setPopupState("none");
	};

	return (
		<box
			flexDirection="column"
			width="100%"
			height="100%"
			overflow="hidden"
			paddingY={1}
		>
			<ChatArea
				conversationTurns={conversationTurns}
				detailExpanded={detailExpanded}
			/>
			<box paddingX={2}>
				<StatusBar
					modelLabel={currentLabel}
					loading={loading}
					error={error}
					turnStatus={lastStatus}
					commandError={commandError}
					connectionStatus={connectionStatus}
					connected={connected}
				/>
				<InputBar
					onSubmit={handleSubmit}
					onEsc={() => {
						if (loading) abort();
					}}
					popupActive={popupState !== "none" || showHelp}
					onOpenModels={() => {
						setShowHelp(false);
						setPopupState((prev) => (prev === "models" ? "none" : "models"));
					}}
					onOpenProviders={() => {
						setShowHelp(false);
						setPopupState((prev) =>
							prev === "providers" ? "none" : "providers",
						);
					}}
					onShowHelp={() => {
						setPopupState("none");
						setShowHelp((prev) => !prev);
					}}
					registry={registry}
				/>
				<InfoBar
					loading={loading}
					detailExpanded={detailExpanded}
					hasCompletedConversation={hasCompletedConversation}
				/>
			</box>

			{/* ── 弹窗层（全屏 overlay 居中）── */}
			{popupState === "models" && (
				<box
					position="absolute"
					top={0}
					left={0}
					width="100%"
					height="100%"
					justifyContent="center"
					alignItems="center"
					zIndex={100}
				>
					<SelectionPopup
						title="Models"
						items={llm.listModels(llm.getDefaultProvider()).map((m) => m.id)}
						currentItemId={llm.getDefaultModelId()}
						onSelect={handleModelSelect}
						onClose={() => setPopupState("none")}
						onSwitchToProviders={() => setPopupState("providers")}
					/>
				</box>
			)}
			{popupState === "providers" && (
				<box
					position="absolute"
					top={0}
					left={0}
					width="100%"
					height="100%"
					justifyContent="center"
					alignItems="center"
					zIndex={100}
				>
					<SelectionPopup
						title="Providers"
						items={[...llm.listProviders(), "Custom"]}
						currentItemId={llm.getDefaultProvider()}
						onSelect={handleProviderSelect}
						onClose={() => setPopupState("none")}
					/>
				</box>
			)}
			{popupState === "apikey" && pendingProvider && (
				<box
					position="absolute"
					top={0}
					left={0}
					width="100%"
					height="100%"
					justifyContent="center"
					alignItems="center"
					zIndex={100}
				>
					<ApiKeyPopup
						provider={pendingProvider}
						onSubmit={handleApiKeySubmit}
						onClose={() => {
							setPendingProvider(null);
							setPopupState("providers");
						}}
					/>
				</box>
			)}
			{popupState === "custom" && (
				<box
					position="absolute"
					top={0}
					left={0}
					width="100%"
					height="100%"
					justifyContent="center"
					alignItems="center"
					zIndex={100}
				>
					<CustomProviderPopup
						onSubmit={handleCustomProviderSubmit}
						onClose={() => setPopupState("providers")}
					/>
				</box>
			)}
			{showHelp && (
				<box
					position="absolute"
					top={0}
					left={0}
					width="100%"
					height="100%"
					justifyContent="center"
					alignItems="center"
					zIndex={100}
				>
					<HelpPopup
						commands={registry.list()}
						onClose={() => setShowHelp(false)}
					/>
				</box>
			)}
		</box>
	);
}
