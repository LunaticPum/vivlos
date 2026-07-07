import { Container, Spacer, TUI } from "@earendil-works/pi-tui";
import { ToolExecution } from "./tool.ts";
import { BorderedMessage } from "../components/bordered-message.ts";
import { AgentStatusBorder } from "../components/agent-status-border.ts";

/**
 * 聊天区容器。
 *
 * 用户消息用 BorderedMessage（黄色），
 * agent 状态用 AgentStatusBorder（turn 序号 + thinking/tool 日志 + 最终消息）。
 */
export interface ChatContainer {
	appendUserMessage(text: string): void;
	appendAssistantMessage(text: string): void;

	// AgentStatusBorder 生命周期
	startTurn(turn: number): void;
	setThinking(text: string): void;
	addTool(name: string): void;
	updateToolResult(text: string): void;
	endTool(): void;
	finalizeTurn(text: string): void;
	clearTurn(): void;
	/** 切换推理细节折叠/展开 */
	toggleDetail(): void;
	/** 追加一条 assistant 消息（非流式路径用） */

	appendToolStart(toolCallId: string, toolName: string): void;
	appendToolEnd(toolCallId: string, isSuccess: boolean, summary: string): void;
	clear(): void;
	readonly container: Container;
}

export function createChatContainer(tui: TUI): ChatContainer {
	const container = new Container();
	const pendingTools = new Map<string, ToolExecution>();
	let agentBorder: AgentStatusBorder | null = null;

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

		// ── AgentStatusBorder 生命周期 ──

		startTurn(turn) {
			if (!agentBorder) {
				agentBorder = new AgentStatusBorder(tui);
				container.addChild(agentBorder);
			}
			agentBorder.startTurn(turn);
		},

		setThinking(text) {
			agentBorder?.setThinking(text);
		},

		addTool(name) {
			agentBorder?.addTool(name);
		},

		updateToolResult(text) {
			agentBorder?.updateToolResult(text);
		},

		endTool() {
			agentBorder?.endTool();
		},

		finalizeTurn(text) {
			agentBorder?.finalize(text);
		},

		clearTurn() {
			agentBorder?.dispose();
			agentBorder = null;
		},

		toggleDetail() {
			agentBorder?.toggle();
		},

		// ── ToolExecution ──

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
			agentBorder?.dispose();
			agentBorder = null;
		},
	};
}