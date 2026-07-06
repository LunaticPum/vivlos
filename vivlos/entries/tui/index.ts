import { TUI, ProcessTerminal, Spacer } from "@earendil-works/pi-tui";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import {
	createChatContainer,
	createInputContainer,
	createStatusContainer,
} from "./containers/index.ts";
import type { CommandContext } from "@vivlos/commands/types.ts";
import type { CommandRegistry } from "@vivlos/commands/index.ts";

/**
 * TUI 应用创建参数——分组管理，职责清晰。
 */
export interface CreateTuiAppParams {
	/** agent 入口——TUI 提交消息时透传 */
	readonly agent: VivlosAgent;
	/** 事件总线——TUI 绑定 agent 事件 */
	readonly eventBus: EventBus;
	/**
	 * 命令上下文（不含 tui——TUI 实例在 createTuiApp 内部创建后补全）。
	 * llm / sessionManager / memoryManager / registry / shutdown 全部在此聚合，
	 * 传给 CommandRegistry 执行 slash 命令。
	 */
	readonly cmdCtx: Omit<CommandContext, "tui">;
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
	const { agent, eventBus, cmdCtx } = params;

	// ── TUI 核心 ──
	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal);

	// 补全 cmdCtx.tui 字段（TUI 实例创建后才能注入）
	const cmdCtxWithTui: CommandContext = { ...cmdCtx, tui };

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
			chat.endStreaming(); // finalize 边框 → ╰──╯
		}
		streamingStarted = false;
		status.clear();
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_start", (e) => {
		chat.appendToolStart(e.callId, e.toolName);
		status.showToolRunning(e.toolName);
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_delta", (_e) => {
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_end", (e) => {
		chat.appendToolEnd(e.callId, e.success, e.result);
		status.showToolDone(e.success);
		tui.requestRender();
	});

	eventBus.on("agent:turn_complete", (_e) => {});

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
			const cmd = cmdCtxWithTui.registry.getSlash(name);
			if (cmd) {
				const result = await cmd.execute(cmdCtxWithTui, args);
				if (result.feedback) {
					status.showHint(result.feedback);
				}
				inputContainer.enable();
				inputContainer.clear();
				tui.requestRender();
				return;
			}
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