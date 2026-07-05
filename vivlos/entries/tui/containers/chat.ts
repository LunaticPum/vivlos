import { Container, Text, Spacer } from "@earendil-works/pi-tui";

/**
 * 聊天区容器。
 *
 * 管理聊天历史中的 Text 组件（每条消息一个 Text）。
 * 流式输出时用一个单独的 Text 组件持续更新。
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
	/** 清空整个聊天区 */
	clear(): void;
	/** 底层 Container（供 index.ts 组装到 TUI） */
	readonly container: Container;
}

export function createChatContainer(): ChatContainer {
	const container = new Container();
	let streamingText: Text | null = null;

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

		clear() {
			container.clear();
			streamingText = null;
		},
	};
}
