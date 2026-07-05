import { Container, Text, Spacer } from "@earendil-works/pi-tui";
import { ToolExecution } from "./tool.ts";

/**
 * 聊天区容器。
 *
 * 管理聊天历史中的 Text 组件（每条消息一个 Text）。
 * 流式输出时用一个单独的 Text 组件持续更新。
 * 工具调用通过独立 ToolExecution 组件渲染，chat 只做生命周期管理。
 *
 * TODO: 后续完善方向——
 * - 消息超过一屏时的滚动/截断策略
 * - user/assistant 消息不同的渲染样式（缩进、颜色、前缀标记）
 * - 支持 markdown 渲染（替换 Text 为 Markdown 组件）
 * - 消息折叠/展开
 */
export interface ChatContainer {
	/** 追加一条用户消息到聊天区 */
	appendUserMessage(text: string): void;
	/** 追加一条 assistant 消息（流式完成后） */
	appendAssistantMessage(text: string): void;
	/** 开始一轮新的流式输出（创建新的 Text 组件） */
	startStreaming(): void;
	/** 更新流式输出内容（text:delta 时调用） */
	updateStreaming(text: string): void;
	/** 结束流式输出（断开引用，不再更新） */
	endStreaming(): void;
	/** 工具开始执行——创建 ToolExecution 挂到聊天区 */
	appendToolStart(toolCallId: string, toolName: string): void;
	/** 工具执行结束——找到对应 ToolExecution 并标记完成 */
	appendToolEnd(
		toolCallId: string,
		toolName: string,
		isSuccess: boolean,
		summary: string,
	): void;
	/** 清空整个聊天区 */
	clear(): void;
	/** 底层 Container（供 index.ts 组装到 TUI） */
	readonly container: Container;
}

export function createChatContainer(): ChatContainer {
	const container = new Container();
	let streamingText: Text | null = null;

	// 工具执行追踪：toolCallId → ToolExecution 实例
	const pendingTools = new Map<string, ToolExecution>();

	return {
		container,

		appendUserMessage(text) {
			// TODO: 后续加样式区分（如 "> 你：text" 或前缀颜色）
			container.addChild(new Text(text, 1, 0));
			container.addChild(new Spacer(1));
		},

		appendAssistantMessage(text) {
			// TODO: 后续加样式区分（如 "vivlos：text" 或前缀颜色）
			container.addChild(new Text(text, 1, 0));
			container.addChild(new Spacer(1));
		},

		startStreaming() {
			streamingText = new Text("", 1, 0);
			container.addChild(streamingText);
		},

		updateStreaming(text) {
			streamingText?.setText(text);
		},

		endStreaming() {
			// 流式完成后 Text 已含最终内容，只需断开引用
			// TODO: 后续可在此添加 finalizer（如移除流式抖动标记、固定样式）
			streamingText = null;
		},

		appendToolStart(toolCallId, toolName) {
			// 🤞🤞🤞...
			const component = new ToolExecution(toolCallId, toolName);
			pendingTools.set(toolCallId, component);
			container.addChild(component.container);
			component.start();
		},

		appendToolEnd(toolCallId, _toolName, isSuccess, summary) {
			const component = pendingTools.get(toolCallId);
			if (!component) return;

			component.end(isSuccess, summary);
			pendingTools.delete(toolCallId);

			// TODO: 后续在 turn_complete 时扫描 agent.messages 中的 toolResult，
			// 取出实际输出文本传入 summary，这里只传空串占位
		},

		clear() {
			for (const [, component] of pendingTools) {
				component.dispose();
			}
			pendingTools.clear();
			container.clear();
			streamingText = null;
		},
	};
}
