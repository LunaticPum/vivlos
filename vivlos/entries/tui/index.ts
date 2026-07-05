import { TUI, ProcessTerminal, Spacer } from "@earendil-works/pi-tui";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import {
	createChatContainer,
	createInputContainer,
	createStatusContainer,
} from "./containers/index.ts";

export interface CreateTuiAppParams {
	readonly agent: VivlosAgent;
	readonly eventBus: EventBus;
}

/**
 * 创建 TUI 应用。
 *
 * 组装 pi-tui 的 TUI + 三个 container（chat / status / input），
 * 绑定 EventBus 事件到 container 的更新方法。
 *
 * TODO: 后续完善方向——
 * - header 区域（标题栏、模型名、版本号）
 * - footer 区域（快捷键提示、token 计数）
 * - 主题/配色支持
 * - 聊天历史滚动（PageUp/PageDown）
 * - Ctrl+C / Ctrl+D 优雅退出
 * - 工具结果文本注入（turn_complete 时扫描 toolResult，传入 ToolExecution.end 的 summary 参数）
 */
export function createTuiApp(params: CreateTuiAppParams) {
	const { agent, eventBus } = params;

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

	eventBus.on("text:delta", (e) => {
		streamingContent += e.delta;
		if (!streamingStarted) {
			streamingStarted = true;
			status.clear();
			chat.startStreaming();
		}
		chat.updateStreaming(streamingContent);
		tui.requestRender();
	});

	eventBus.on("text:complete", (e) => {
		if (!streamingStarted) {
			// non-streaming 路径——没有 delta 只有 complete，
			// startStreaming 从未触发，改用 appendAssistantMessage 兜底
			chat.appendAssistantMessage(e.content);
		} else {
			chat.updateStreaming(e.content);
			chat.endStreaming();
		}
		status.clear();
		tui.requestRender();
	});

	// ── 工具执行可视化 ──
	eventBus.on("tool:call_start", (e) => {
		chat.appendToolStart(e.callId, e.toolName);
		tui.requestRender();
	});

	eventBus.on("tool:call_end", (e) => {
		chat.appendToolEnd(e.callId, e.success, "");
		tui.requestRender();
	});

	eventBus.on("agent:turn_complete", () => {
		// TODO: 后续可在此更新 turn 计数器
		// TODO: 扫描 agent.getMessages() 最后一条 toolResult，
		// 取出实际输出文本传进 chat.appendToolEnd 的 summary 参数
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

	// ── 输入提交 → agent ──
	inputContainer.onSubmit = async (value: string) => {
		if (!value.trim()) return;

		inputContainer.disable();
		inputContainer.clear();
		chat.appendUserMessage(value);
		tui.requestRender();

		try {
			await agent.prompt(value);
		} catch (err) {
			// agent 内部已通过 eventbus 发 error 事件
			// 这里兜底防止 unhandled rejection
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
