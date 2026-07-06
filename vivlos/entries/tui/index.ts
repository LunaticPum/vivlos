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

	// agent:start —— 重置流式状态，显示 loading
	eventBus.on("agent:start", () => {
		streamingContent = "";
		streamingStarted = false;
		status.showLoading();
		tui.requestRender();
	});

	// agent:message_start —— 消息开始（显示角色标识）
	eventBus.on("agent:message_start", (e) => {
		// TODO: 后续根据 e.role 显示不同前缀标识
		tui.requestRender();
	});

	// agent:message_delta —— 流式增量文本
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

	// agent:message_complete —— 消息文本收尾
	eventBus.on("agent:message_complete", (e) => {
		if (!streamingStarted) {
			// non-streaming 路径——没有 delta 只有 complete
			chat.appendAssistantMessage(e.content);
		} else {
			chat.updateStreaming(e.content);
			chat.endStreaming();
		}
		status.clear();
		tui.requestRender();
	});

	// agent:toolCall_start —— 工具开始执行
	eventBus.on("agent:toolCall_start", (e) => {
		chat.appendToolStart(e.callId, e.toolName);
		status.showToolRunning(e.toolName);
		tui.requestRender();
	});

	// agent:toolCall_delta —— 工具执行中间态（流式进度）
	eventBus.on("agent:toolCall_delta", (e) => {
		// TODO: 后续可在此更新 ToolExecution 组件的中间态
		// 或在 status 区展示 partialResult 摘要
		tui.requestRender();
	});

	// agent:toolCall_end —— 工具执行结束
	eventBus.on("agent:toolCall_end", (e) => {
		chat.appendToolEnd(e.callId, e.success, e.result);
		status.showToolDone(e.success);
		tui.requestRender();
	});

	// agent:turn_complete —— 一轮结束
	eventBus.on("agent:turn_complete", (_e) => {
		// TODO: 后续可在此更新 turn 计数器
	});

	// agent:complete —— agent 整体完成
	eventBus.on("agent:complete", () => {
		status.clear();
		inputContainer.enable();
		tui.requestRender();
	});

	// agent:error —— agent 异常
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