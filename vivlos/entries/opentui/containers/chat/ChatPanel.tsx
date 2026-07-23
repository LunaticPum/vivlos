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
import { StatusBar } from "./StatusBar";
import { InputBar } from "./InputBar";
import { InfoBar } from "./InfoBar";
import { useNotification } from "../../hooks/useNotification";
import { useExitHandler } from "../../hooks/useExitHandler";
import { useProviderManager } from "../../hooks/useProviderManager.js";
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

type PopupState =
	| "none"
	| "models"
	| "providers"
	| "apikey"
	| "custom"
	| "sessions";

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
	const [currentSessionId, setCurrentSessionId] = useState(
		agent.getSessionId(),
	);
	const [showWelcome, setShowWelcome] = useState(true);
	const { notification, notify } = useNotification();
	const { exitPending, handleCtrlC } = useExitHandler(onExit, loading, abort);
	const sessionLabel = agent.getSessionName() ?? currentSessionId;

	// ── Provider 管理（抽取到 useProviderManager hook）──
	const {
		currentLabel,
		connected,
		connectionStatus,
		pendingProvider,
		handleProviderSelect,
		handleModelSelect,
		handleApiKeySubmit,
		handleCustomProviderSubmit,
		setPendingProvider,
	} = useProviderManager(llm, llmConfigRepo, modelLabel, (s) =>
		setPopupState(s as PopupState),
	);

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
				if (agent.listSessions().length >= 10) {
					notify("已达 10 个会话上限，请删除或压缩旧会话", "warning");
					return;
				}
				useNewSession();
				setCurrentSessionId(agent.getSessionId());
				setShowWelcome(false);
			},
			renameSession: (name: string) => {
				agent.renameSession(name);
			},
			switchToSession: (id: string) => {
				switchSession(id);
				setCurrentSessionId(id);
				setShowWelcome(false);
			},
			notify,
		}),
		[clearConversation, agent, switchSession, useNewSession, notify],
	);

	// ── InputBar 提交：走 checkCommand 派发 ──
	const handleSubmit = useCallback(
		(text: string) => {
			const result = checkCommand(text, registry, cmdCtx);
			if (!result.handled) {
				setShowWelcome(false);
				submit(text);
				return;
			}
			// 命令已执行，不改 showWelcome（弹窗类命令不应退出欢迎窗口）
			if (result.error) {
				notify(result.error, "error");
			}
		},
		[registry, cmdCtx, submit, notify],
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
			<box paddingX={2} flexShrink={0}>
				<StatusBar
					modelLabel={currentLabel}
					loading={loading}
					error={error}
					turnStatus={lastStatus}
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
					{(() => {
						const sessions = agent.listSessions();
						const current = sessions.find((s) => s.id === currentSessionId);
						const others = sessions.filter((s) => s.id !== currentSessionId);
						const fmtTok = (n: number) =>
							n >= 1_000_000
								? `${Math.floor(n / 1_000_000)}M`
								: n >= 1000
									? `${Math.floor(n / 1000)}k`
									: `${n}`;
						const toItem = (s: (typeof sessions)[number]): SelectionItem => ({
							id: s.id,
							label: s.name ?? s.id,
							suffix: `${s.turnCount} msg / ${fmtTok(s.totalTokens)}`,
						});
						return (
							<SelectionPopup
								title="Sessions"
								recentItems={others.map(toItem)}
								allItems={current ? [toItem(current)] : []}
								currentItemId={currentSessionId}
								onSelect={(id) => {
									switchSession(id);
									setCurrentSessionId(id);
									setShowWelcome(false);
									setPopupState("none");
								}}
								onClose={() => setPopupState("none")}
							/>
						);
					})()}
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
