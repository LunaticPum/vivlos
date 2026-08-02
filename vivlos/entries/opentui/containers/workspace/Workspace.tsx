/**
 * Workspace - TUI 顶层工作区。
 *
 * 管理 Welcome/Session 主视图、共享控制区、Sidebar 和全屏弹窗。
 * ChatPanel 只负责 Session 会话内容，不参与顶层页面选择。
 */

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { ChatControls } from "../chat/ChatControls";
import { WelcomeScreen } from "../../components/welcome/WelcomeScreen";
import { Sidebar } from "../sidebar/Sidebar";
import { formatTokens } from "@vivlos/shared/utils/index.ts";
import { useNotification } from "../../hooks/useNotification";
import { useExitHandler } from "../../hooks/useExitHandler";
import { log } from "@vivlos/infra/logger/logger.ts";
import { loadConfig } from "@vivlos/infra/config/index.ts";
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
import type { PiAiVersionInfo } from "@vivlos/infra/version.ts";

/** 截断字符串，超长用 ... 替代（仅用于显示，不影响存储） */
function truncate(s: string, max: number): string {
	return s.length > max ? `${s.slice(0, max)}...` : s;
}

// #region Types

export interface WorkspaceProps {
	modelLabel: string;
	agent: VivlosAgent;
	eventBus: EventBus;
	llm: LLMClient;
	llmConfigRepo: LLMConfigRepository;
	piAiVersion: PiAiVersionInfo;
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

type SidebarSection = "none" | "memory" | "todo";

// #endregion

// #region Workspace

export function Workspace({
	modelLabel,
	agent,
	eventBus,
	llm,
	llmConfigRepo,
	piAiVersion,
	onExit,
}: WorkspaceProps) {
	// #region Agent 与视图状态

	const {
		conversationTurns,
		loading,
		submit,
		abort,
		clearConversation,
		switchSession,
		deleteSession,
		renameSession,
		compact,
		newSession: useNewSession,
		currentSession,
		sessions,
		memoryOverview,
		todoList,
	} = useAgent(agent, eventBus);

	const [detailExpanded, setDetailExpanded] = useState(false);
	const [popupState, setPopupState] = useState<PopupState>("none");
	const [showHelp, setShowHelp] = useState(false);
	const [sidebarSection, setSidebarSection] = useState<SidebarSection>("none");
	const memoryActive = sidebarSection === "memory";
	const [compressing, setCompressing] = useState(false);
	const { notification } = useNotification(eventBus);
	const { exitPending, handleCtrlC } = useExitHandler(onExit, loading, abort);

	// #endregion

	// #region 运行状态

	useEffect(() => {
		const offStart = eventBus.on("compaction:started", () =>
			setCompressing(true),
		);
		const offEnd = eventBus.on("compaction:ended", () => setCompressing(false));
		return () => {
			offStart();
			offEnd();
		};
	}, [eventBus]);

	// #endregion

	// #region Provider

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
	} = useProviderManager(llm, llmConfigRepo, modelLabel, (state) => {
		setSidebarSection("none");
		setPopupState(state as PopupState);
	});

	// #endregion

	// #region 命令与视图切换

	const registryRef = useRef<TUICommandRegistry | null>(null);
	if (registryRef.current === null) {
		registryRef.current = createTUICommandRegistry();
		registerBuiltinCommands(registryRef.current);
	}
	const registry = registryRef.current;
	const hasCompletedConversation = conversationTurns.some(
		(t) => t.status === "complete",
	);

	const handleClear = useCallback(() => {
		clearConversation();
	}, [clearConversation]);

	const handleNew = useCallback(() => {
		if (sessions.length >= 10) {
			log("warn", "已达 10 个会话上限，请删除或压缩旧会话", undefined, true);
			return;
		}
		useNewSession();
		setSidebarSection("none");
	}, [sessions.length, useNewSession]);

	const handleSession = useCallback(
		(id: string) => {
			switchSession(id);
			setSidebarSection("none");
		},
		[switchSession],
	);

	const cmdCtx = useMemo<CommandContext>(
		() => ({
			openModels: () => {
				setSidebarSection("none");
				setPopupState("models");
			},
			openProviders: () => {
				setSidebarSection("none");
				setPopupState("providers");
			},
			openSessions: () => {
				setSidebarSection("none");
				setPopupState("sessions");
			},
			toggleDetail: () => setDetailExpanded((v) => !v),
			showHelp: () => {
				setSidebarSection("none");
				setShowHelp(true);
			},
			clearConversation: handleClear,
			newSession: handleNew,
			renameSession,
			switchToSession: handleSession,
			compact: async () => {
				const messageCount = currentSession?.messageCount ?? 0;
				if (messageCount === 0) {
					log("warn", "无对话内容可压缩", undefined, true);
					return;
				}
				if (!hasCompletedConversation) {
					log(
						"warn",
						"首轮对话无法压缩，至少完成一轮对话后使用",
						undefined,
						true,
					);
					return;
				}
				const { protectLastN } = loadConfig().compression;
				if (messageCount < protectLastN * 2) {
					log("warn", "对话过短，无需压缩", undefined, true);
					return;
				}
				log("warn", "正在压缩上下文...", undefined, true);
				try {
					const result = await compact();
					if (result.noOp) {
						log("warn", "无可压缩内容", undefined, true);
					} else {
						log(
							"info",
							`上下文压缩完成（${result.compactedCount} 条消息）`,
							undefined,
							true,
						);
					}
				} catch (err) {
					log(
						"error",
						`压缩失败: ${err instanceof Error ? err.message : String(err)}`,
						undefined,
						true,
					);
				}
			},
		}),
		[
			compact,
			currentSession?.messageCount,
			handleClear,
			handleNew,
			handleSession,
			hasCompletedConversation,
			renameSession,
		],
	);

	const handleSubmit = useCallback(
		(text: string) => {
			const result = checkCommand(text, registry, cmdCtx);
			if (!result.handled) {
				submit(text);
				return;
			}
			// 弹窗类命令不改变 welcome/session 主视图。
			if (result.error) {
				log("error", result.error, undefined, true);
			}
		},
		[registry, cmdCtx, submit],
	);

	// #endregion

	// #region 派生显示状态

	// 取最后一个有 usage 的 ConversationTurn（新 turn 开始时仍显示上一轮对话的上下文大小）
	const lastTurnWithUsage = [...conversationTurns]
		.reverse()
		.find((t) => t.usage);
	const lastTurn =
		conversationTurns.length > 0
			? conversationTurns[conversationTurns.length - 1]
			: undefined;
	const lastStatus = lastTurn?.status;
	const currentSessionId = currentSession?.id ?? "";
	const durationResetKey = currentSession
		? `${currentSession.id}:${currentSession.pending ? "pending" : "active"}`
		: "none";
	const currentMemoryOverview = memoryOverview?.sessionId === currentSessionId
		? memoryOverview
		: null;
	const welcomeVisible =
		(currentSession === null || currentSession.pending) &&
		conversationTurns.length === 0;
	const sessionName = currentSession?.name ?? (
		conversationTurns.length === 0 ? "无对话记录" : "未命名会话"
	);

	// #endregion

	// #region 页面组合

	return (
		<box flexDirection="row" width="100%" height="100%" overflow="hidden">
			<box
				flexDirection="column"
				flexGrow={1}
				height="100%"
				overflow="hidden"
				paddingY={1}
				gap={1}
				onMouseDown={() => setSidebarSection("none")}
			>
				{welcomeVisible ? (
					<WelcomeScreen
						cwd={process.cwd()}
						sessionId={currentSessionId}
						modelLabel={currentLabel}
						version="1.0.0"
						piAi={piAiVersion}
					/>
				) : (
					<ChatPanel
						conversationTurns={conversationTurns}
						detailExpanded={detailExpanded}
					/>
				)}
				<ChatControls
					status={{
						modelLabel: currentLabel,
						loading,
						turnStatus: lastStatus,
						connectionStatus,
						connected,
						exitPending,
						notification,
						showSession: conversationTurns.length > 0,
						durationResetKey,
						usage: lastTurnWithUsage?.usage,
						contextWindow: llm.getModel(
							llm.getDefaultProvider(),
							llm.getDefaultModelId(),
						)?.contextWindow,
					}}
					input={{
						onSubmit: handleSubmit,
						onCtrlC: handleCtrlC,
						popupActive: popupState !== "none" || showHelp || memoryActive,
						onOpenModels: () => {
							setSidebarSection("none");
							setShowHelp(false);
							setPopupState((prev) => (prev === "models" ? "none" : "models"));
						},
						onOpenProviders: () => {
							setSidebarSection("none");
							setShowHelp(false);
							setPopupState((prev) =>
								prev === "providers" ? "none" : "providers",
							);
						},
						onShowHelp: () => {
							setSidebarSection("none");
							setPopupState("none");
							setShowHelp((prev) => !prev);
						},
						registry,
					}}
					info={{
						loading,
						detailExpanded,
						hasCompletedConversation,
						compressing,
						compressingModel: currentLabel,
					}}
				/>
			</box>
			{!welcomeVisible && (
				<Sidebar
					todoList={todoList}
					memoryActive={memoryActive}
					todoActive={sidebarSection === "todo"}
					onMemoryActiveChange={(active) =>
						setSidebarSection(active ? "memory" : "none")
					}
					onTodoActiveChange={(active) =>
						setSidebarSection(active ? "todo" : "none")
					}
					preview={{
						sessionName,
						sessionId: currentSessionId,
						titleGenerating: false,
						path: currentMemoryOverview?.directory ?? null,
						cwd: process.cwd(),
						memory: currentMemoryOverview?.memory ?? null,
						user: currentMemoryOverview?.user ?? null,
					}}
				/>
			)}

			{/* #region Workspace Popup Layer */}
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
									suffix:
										formatTokens(llm.getModel(p, m)?.contextWindow ?? 0) ||
										undefined,
								};
							})}
						allItems={llm
							.listModels(llm.getDefaultProvider())
							.map<SelectionItem>((m) => ({
								id: `${llm.getDefaultProvider()}/${m.id}`,
								label: m.id,
								suffix: formatTokens(m.contextWindow),
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
						const current = sessions.find((s) => s.id === currentSessionId);
						const others = sessions.filter((s) => s.id !== currentSessionId);
						const toItem = (s: (typeof sessions)[number]): SelectionItem => ({
							id: s.id,
							label: s.name ?? s.id,
							suffix: `${s.turnCount} msg / ${formatTokens(s.totalTokens)}`,
						});
						return (
							<SelectionPopup
								title="Sessions"
								recentItems={others.map(toItem)}
								allItems={current ? [toItem(current)] : []}
								currentItemId={currentSessionId}
								onSelect={(id) => {
									handleSession(id);
									setPopupState("none");
								}}
								onClose={() => setPopupState("none")}
								onDelete={deleteSession}
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
			{/* #endregion */}
		</box>
	);
}

// #endregion

// #endregion
