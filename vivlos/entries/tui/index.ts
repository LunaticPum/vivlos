import { TUI, ProcessTerminal, Spacer } from "@earendil-works/pi-tui";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import {
	createChatContainer,
	createInputContainer,
	createStatusContainer,
} from "./containers/index.ts";
import type { CommandRegistry } from "@vivlos/commands/index.ts";
import type { CommandContext } from "@vivlos/commands/types.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { SessionManager } from "@vivlos/agent/session/index.ts";
import type { MemoryManager } from "@vivlos/agent/memory/index.ts";

export interface CreateTuiAppParams {
	readonly agent: VivlosAgent;
	readonly eventBus: EventBus;
	readonly registry: CommandRegistry;
	readonly llm: LLMClient;
	readonly sessionManager: SessionManager;
	readonly memoryManager: MemoryManager;
}

/**
 * 创建 TUI 应用。
 *
 * 组装 pi-tui 的 TUI + 三个 container（chat / status / input），
 * 绑定 EventBus 事件到 container 的更新方法。
 * 拦截以 / 开头的输入为 slash 命令，通过 CommandRegistry 执行。
 *
 * TODO: 后续完善方向——
 * - header 区域（标题栏、模型名、版本号）
 * - footer 区域（快捷键提示、token 计数）
 * - 主题/配色支持
 * - 聊天历史滚动（PageUp/PageDown）
 */
export function createTuiApp(params: CreateTuiAppParams) {
	const { agent, eventBus, registry, llm, sessionManager, memoryManager } = params;

	// ── TUI 核心 ──
	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal);

	// ── 组装三个区域 ──
	const chat = createChatContainer();
	const status = createStatusContainer(tui);
	const inputContainer = createInputContainer();

	// 布局从上到下：聊天区 → 状态区 → 输入区
	tui.addChild(chat.container);
	tui.addChild(status.container);
	tui.addChild(new Spacer(1));
	tui.addChild(inputContainer.input);
	tui.setFocus(inputContainer.input);

	// ── 命令上下文 ──
	const cmdCtx: CommandContext = {
		llm,
		eventBus,
		sessionManager,
		memoryManager,
		tui,
		registry,
	};

	// ── 流式回复状态 ──
	let streamingContent = "";
	let streamingStarted = false;

	// ── EventBus → UI 更新 ──

	eventBus.on("agent:start", () => {
		streamingContent = "";
		streamingStarted = false;
		status.showLoading();
		tui.requestRender();
	});

	eventBus.on("agent:message_start", (_e) => {
		// TODO: 后续根据 e.role 显示不同前缀标识
		tui.requestRender();
	});

	eventBus.on("agent:message_delta", (e) => {
		streamingContent += e.delta;
		if (!streamingStarted) {
			streamingStarted = true;
			status.clear();
			chat.startStreaming();
		}
		chat.updateStreaming(streamingContent);
		tui.requestRender();
	});

	eventBus.on("agent:message_complete", (e) => {
		if (!streamingStarted) {
			chat.appendAssistantMessage(e.content);
		} else {
			chat.updateStreaming(e.content);
			chat.endStreaming();
		}
		status.clear();
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_start", (e) => {
		chat.appendToolStart(e.callId, e.toolName);
		status.showToolRunning(e.toolName);
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_delta", (_e) => {
		// TODO: 后续可在此更新 ToolExecution 组件的中间态
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_end", (e) => {
		chat.appendToolEnd(e.callId, e.success, e.result);
		status.showToolDone(e.success);
		tui.requestRender();
	});

	eventBus.on("agent:turn_complete", (_e) => {
		// TODO: 后续可在此更新 turn 计数器
	});

	eventBus.on("agent:complete", () => {
		status.clear();
		inputContainer.enable();
		tui.requestRender();
	});

	eventBus.on("agent:error", (e) => {
		status.showError(e.error.message);
		inputContainer.enable();
		tui.requestRender();
	});

	// ── 输入提交 ──
	inputContainer.onSubmit = async (value: string) => {
		if (!value.trim()) return;

		// ——— slash 命令拦截 ———
		if (value.startsWith("/")) {
			const [name, ...rest] = value.slice(1).split(" ");
			const args = rest.join(" ");
			const cmd = registry.getSlash(name);
			if (cmd) {
				const result = await cmd.execute(cmdCtx, args);
				if (result.feedback) {
					status.showHint(result.feedback);
				}
				inputContainer.enable();
				inputContainer.clear();
				tui.requestRender();
				return;
			}
			// 未知命令——作为普通消息传 LLM
		}

		inputContainer.disable();
		inputContainer.clear();
		chat.appendUserMessage(value);
		tui.requestRender();

		try {
			await agent.prompt(value);
		} catch (err) {
			status.showError(
				`fatal: ${err instanceof Error ? err.message : String(err)}`,
			);
			inputContainer.enable();
			tui.requestRender();
		}
	};

	// Esc 退出
	inputContainer.onEscape = () => {
		tui.stop();
		process.exit(0);
	};

	return {
		start() {
			tui.start();
		},
		stop() {
			tui.stop();
		},
	};
}