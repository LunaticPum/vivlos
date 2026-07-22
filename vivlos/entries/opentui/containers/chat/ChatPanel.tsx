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
import {
	SelectionPopup,
	type SelectionItem,
} from "../../components/popups/SelectionPopup";
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
import type { LLMConfigRepository } from "@vivlos/infra/storage/index.ts";

/** 格式化 context window 为简洁后缀 */
function fmtCtx(n?: number): string | undefined {
	if (!n) return undefined;
	if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)}M`;
	if (n >= 1000) return `${Math.floor(n / 1000)}k`;
	return `${n}`;
}

/** 截断字符串，超长用 ... 替代（仅用于显示，不影响存储） */
function truncate(s: string, max: number): string {
	return s.length > max ? `${s.slice(0, max)}...` : s;
}

export interface ChatProps {
	modelLabel: string;
	agent: VivlosAgent;
	eventBus: EventBus;
	llm: LLMClient;
	llmConfigRepo: LLMConfigRepository;
	/** 退出应用回调（双击 Ctrl+C 触发） */
	onExit: () => void;
}

type PopupState = "none" | "models" | "providers" | "apikey" | "custom" | "sessions";

export function Chat({
	modelLabel,
	agent,
	eventBus,
	llm,
	llmConfigRepo,
	onExit,
}: ChatProps) {
	const {
		conversationTurns,
		loading,
		error,
		submit,
		abort,
		clearConversation,
		switchSession,
		newSession: useNewSession,
	} = useAgent(agent, eventBus);

	const [detailExpanded, setDetailExpanded] = useState(false);
	const [popupState, setPopupState] = useState<PopupState>("none");
	const [showHelp, setShowHelp] = useState(false);
	const [currentLabel, setCurrentLabel] = useState(modelLabel);
	const [currentSessionId, setCurrentSessionId] = useState(agent.getSessionId());
	const [sessionLabel, setSessionLabel] = useState(agent.getSessionName() ?? agent.getSessionId());
	const [showWelcome, setShowWelcome] = useState(true);
	const [notification, setNotification] = useState<{ message: string; color?: string } | null>(null);
	const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/** 通知总线：生成者指定消息/颜色/延迟（默认 3s），StatusBar 自动消费 */
	const notify = useCallback((message: string, color?: string, duration = 3000) => {
		if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
		setNotification({ message, color });
		notifTimerRef.current = setTimeout(() => setNotification(null), duration);
	}, []);
	const [pendingProvider, setPendingProvider] = useState<string | null>(null);
	const [commandError, setCommandError] = useState<string | null>(null);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
		state: "idle",
	});
	const [connected, setConnected] = useState(false);
	const [exitPending, setExitPending] = useState(false);
	const exitPendingRef = useRef(false);
	const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/** Ctrl+C：loading 时打断，idle 时双击退出 */
	const handleCtrlC = useCallback(() => {
		if (loading) {
			abort();
			return;
		}
		// 用 ref 读状态，避免 useKeyboard 回调用旧闭包
		if (exitPendingRef.current) {
			if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
			onExit();
			return;
		}
		exitPendingRef.current = true;
		setExitPending(true);
		exitTimerRef.current = setTimeout(() => {
			exitPendingRef.current = false;
			setExitPending(false);
			exitTimerRef.current = null;
		}, 3000);
	}, [loading, abort, onExit]);

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
			openSessions: () => setPopupState("sessions"),
			toggleDetail: () => setDetailExpanded((v) => !v),
			showHelp: () => setShowHelp(true),
			clearConversation,
			newSession: () => {
				useNewSession();
				setCurrentSessionId(agent.getSessionId());
				setSessionLabel(agent.getSessionName() ?? agent.getSessionId());
			},
			renameSession: (name: string) => {
				agent.renameSession(name);
				setSessionLabel(name);
			},
			switchToSession: (id: string) => {
				switchSession(id);
				setCurrentSessionId(id);
				setSessionLabel(agent.getSessionName() ?? id);
			},
			notify,
		}),
		[clearConversation, agent, switchSession, useNewSession, notify],
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
				setShowWelcome(false);
				submit(text);
				return;
			}
			// 命令已执行，也关闭欢迎窗口
			setShowWelcome(false);
			if (result.error) {
				showCommandError(result.error);
			}
		},
		[registry, cmdCtx, submit, showCommandError],
	);

	const hasCompletedConversation = conversationTurns.some(
		(t) => t.status === "complete",
	);

	// 取最后一个有 usage 的 ConversationTurn（新 turn 开始时仍显示上一轮对话的上下文大小）
	const lastTurnWithUsage = [...conversationTurns]
		.reverse()
		.find((t) => t.usage);
	const lastTurn =
		conversationTurns.length > 0
			? conversationTurns[conversationTurns.length - 1]
			: undefined;
	const lastStatus = lastTurn?.status;

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
		// 检查是否有 API key（credential store 或环境变量）
		const hasKey = await llm.hasCredential(providerId);
		const envVar = `${providerId.toUpperCase().replace(/-/g, "_")}_API_KEY`;
		if (!hasKey && !process.env[envVar]) {
			setPendingProvider(providerId);
			setPopupState("apikey");
			return;
		}
		// 已有凭证 = 之前连接成功过，直接切换，不做验证
		const models = llm.listModels(providerId);
		// 优先用上次使用的 model（recent 格式为 provider/modelId）
		const recentModels = llmConfigRepo.loadRecentModels();
		const lastUsedEntry = recentModels.find((e) =>
			e.startsWith(`${providerId}/`),
		);
		const lastUsedId = lastUsedEntry?.split("/")[1];
		const hasModel = lastUsedId && models.some((m) => m.id === lastUsedId);
		if (!hasModel) {
			// 没有上次使用记录，先切 provider 再弹 models
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

	// ── API Key 连接验证 + 切换（3s 超时）──
	const verifyAndSwitch = async (providerId: string) => {
		setPopupState("none");
		setConnectionStatus({ state: "connecting", provider: providerId });

		try {
			const models = llm.listModels(providerId);
			const model = models[0];
			if (!model) throw new Error("no models available");

			// 连接验证：发送最小请求测试 API 可达性，15s 超时
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
			setCurrentLabel(`${truncate(providerId, 15)}/${model.id}`);
			setConnected(true);
			setConnectionStatus({ state: "success", provider: providerId });
			// 成功提示显示 3s 后恢复 idle 并关闭弹窗
			setTimeout(() => {
				setConnectionStatus({ state: "idle" });
				setPopupState("none");
			}, 3000);

			// ── SQLite 持久化 ──
			llmConfigRepo.saveConfig({
				defaultProvider: providerId,
				defaultModelId: model.id,
			});
			llmConfigRepo.addRecentProvider(providerId);
			llmConfigRepo.addRecentModel(`${providerId}/${model.id}`);
		} catch (err) {
			// 连接失败：如果是自定义 provider，从内存列表和 SQLite 中移除
			const customIds = llmConfigRepo.listCustomProviders();
			if (customIds.some((id) => id.startsWith(`${providerId}/`))) {
				llm.removeProvider(providerId);
				customIds
					.filter((id) => id.startsWith(`${providerId}/`))
					.forEach((id) => llmConfigRepo.removeCustomProvider(id));
			}
			const errorMsg = err instanceof Error ? err.message : String(err);
			setConnectionStatus({
				state: "failed",
				provider: providerId,
				error: errorMsg,
			});
			// 失败提示显示 3s 后恢复 idle
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
		contextWindow?: number;
	}) => {
		const providerId = llm.addCustomProvider(config);
		llmConfigRepo.saveCustomProvider(`${providerId}/${config.modelId}`, config);
		await llm.setCredential(providerId, config.apiKey);
		await verifyAndSwitch(providerId);
	};

	// ── model 选择（接收 provider/modelId 格式）──
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
				showWelcome={showWelcome}
				welcomeInfo={{
					cwd: process.cwd(),
					sessionId: currentSessionId,
					modelLabel: currentLabel,
					version: "1.0.0",
				}}
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
					exitPending={exitPending}
					notification={notification}
					showSession={conversationTurns.length > 0}
					sessionId={sessionLabel}
					usage={lastTurnWithUsage?.usage}
					contextWindow={
						llm.getModel(llm.getDefaultProvider(), llm.getDefaultModelId())
							?.contextWindow
					}
				/>
				<InputBar
					onSubmit={handleSubmit}
					onCtrlC={handleCtrlC}
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
						recentItems={llmConfigRepo
							.loadRecentModels()
							.map<SelectionItem>((entry) => {
								const [p, m] = entry.split("/");
								return {
									id: entry,
									label: `[${truncate(p, 10)}] ${m}`,
									suffix: fmtCtx(llm.getModel(p, m)?.contextWindow),
								};
							})}
						allItems={llm
							.listModels(llm.getDefaultProvider())
							.map<SelectionItem>((m) => ({
								id: `${llm.getDefaultProvider()}/${m.id}`,
								label: m.id,
								suffix: fmtCtx(m.contextWindow),
							}))}
						currentItemId={`${llm.getDefaultProvider()}/${llm.getDefaultModelId()}`}
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
						recentItems={llmConfigRepo
							.loadRecentProviders()
							.filter((id) => llm.listProviders().includes(id))
							.map<SelectionItem>((id) => ({ id, label: truncate(id, 25) }))}
						allItems={["Custom", ...llm.listProviders()].map<SelectionItem>(
							(id) => ({ id, label: truncate(id, 25) }),
						)}
						currentItemId={llm.getDefaultProvider()}
						onSelect={handleProviderSelect}
						onClose={() => setPopupState("none")}
				/>
			</box>
		)}
		{popupState === "sessions" && (
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
					title="Sessions"
					recentItems={[]}
					allItems={agent.listSessions().map<SelectionItem>((s) => ({
						id: s.id,
						label: s.name ?? s.id,
						suffix: `${s.messageCount}msg`,
					}))}
					currentItemId={agent.getMessages().length > 0 ? "" : ""}
					onSelect={(id) => {
						switchSession(id);
						setCurrentSessionId(id);
						setSessionLabel(agent.getSessionName() ?? id);
						setPopupState("none");
					}}
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
