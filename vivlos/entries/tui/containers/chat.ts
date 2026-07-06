import { Container, Spacer } from "@earendil-works/pi-tui";
import { ToolExecution } from "./tool.ts";
import { BorderedMessage } from "../components/bordered-message.ts";
import { StreamingBorderedMessage } from "../components/streaming-bordered-message.ts";

/**
 * 聊天区容器。
 *
 * 用户消息用 BorderedMessage 包裹（黄色边框），
 * agent 流式输出用 StreamingBorderedMessage（上框+左右立即显示，结束时加底框），
 * 工具调用用 ToolExecution 渲染。
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
	let streamingMsg: StreamingBorderedMessage | null = null;
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
			streamingMsg = new StreamingBorderedMessage("vivlos", "blue");
			container.addChild(streamingMsg);
		},

		updateStreaming(text) {
			streamingMsg?.setText(text);
		},

		endStreaming() {
			streamingMsg?.finalize(); // 加 ╰──╯ 底边框
			streamingMsg = null;
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
			streamingMsg = null;
		},
	};
}