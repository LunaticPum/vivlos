import { Container, Text, Spacer } from "@earendil-works/pi-tui";
import { ToolExecution } from "./tool.ts";
import { BorderedMessage } from "../components/bordered-message.ts";

/**
 * 聊天区容器。
 *
 * 用户/agent 消息用 BorderedMessage 包裹（圆角彩色边框），
 * 流式输出用独立 Text 持续更新，工具调用用 ToolExecution 渲染。
 *
 * TODO: 后续完善方向——
 * - 消息超过一屏时的滚动/截断策略
 * - 支持 markdown 渲染（BorderedMessage 内嵌 Markdown 组件）
 * - 消息折叠/展开
 */
export interface ChatContainer {
	appendUserMessage(text: string): void;
	appendAssistantMessage(text: string): void;
	startStreaming(): void;
	updateStreaming(text: string): void;
	endStreaming(): void;
	appendToolStart(toolCallId: string, toolName: string): void;
	appendToolEnd(toolCallId: string, isSuccess: boolean, summary: string): void;
	clear(): void;
	readonly container: Container;
}

export function createChatContainer(): ChatContainer {
	const container = new Container();
	let streamingText: Text | null = null;
	const pendingTools = new Map<string, ToolExecution>();

	return {
		container,

		appendUserMessage(text) {
			const msg = new BorderedMessage("You", text, "yellow");
			container.addChild(msg);
			container.addChild(new Spacer(1));
		},

		appendAssistantMessage(text) {
			const msg = new BorderedMessage("vivlos", text, "blue");
			container.addChild(msg);
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
			streamingText = null;
		},

		appendToolStart(toolCallId, toolName) {
			const component = new ToolExecution(toolCallId, toolName);
			pendingTools.set(toolCallId, component);
			container.addChild(component.container);
			component.start();
		},

		appendToolEnd(toolCallId, isSuccess, summary) {
			const component = pendingTools.get(toolCallId);
			if (!component) return;
			component.end(isSuccess, summary);
			pendingTools.delete(toolCallId);
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