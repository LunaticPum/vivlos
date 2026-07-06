import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { VivlosEvent } from "@vivlos/infra/eventbus/types.ts";

// ── 辅助 ──

/** 从 AgentMessage 提取纯文本 */
function extractText(message: AgentMessage): string {
	if (message.role === "user") {
		const c = message.content;
		return typeof c === "string"
			? c
			: c
					.filter((t): t is TextContent => t.type === "text")
					.map((t) => t.text)
					.join("");
	}

	if (message.role === "assistant") {
		return message.content
			.filter((t): t is TextContent => t.type === "text")
			.map((t) => t.text)
			.join("");
	}

	return "";
}

// ── 映射 ──

/**
 * pi AgentEvent → VivlosEvent[] 映射。
 *
 * 对齐 vivlos eventbus/types.ts 的 10 种 VivlosEvent，
 * 统一 agent: 前缀 + _start/_delta/_complete/_end 后缀命名。
 */
export function mapAgentEvent(
	event: AgentEvent,
	sessionId: string,
	turn: number,
): VivlosEvent[] {
	switch (event.type) {
		// ——— agent 生命周期 ———
		case "agent_start":
			return [{ type: "agent:start", sessionId }];

		case "agent_end": {
			const lastMsg = event.messages[event.messages.length - 1];
			const finalMessage = lastMsg ? extractText(lastMsg) : "";
			return [{ type: "agent:complete", sessionId, finalMessage }];
		}

		case "turn_start":
			return [{ type: "agent:turn_start", sessionId, turn }];

		case "turn_end": {
			const events: VivlosEvent[] = [
				{ type: "agent:turn_complete", sessionId, turn },
			];

			const msg = event.message;

			// stopReason=error/aborted → agent:error（仅 AssistantMessage 有）
			// TODO: 待补全 length（截断）、toolUse（继续 loop）等场景
			if (
				msg.role === "assistant" &&
				(msg.stopReason === "error" || msg.stopReason === "aborted")
			) {
				events.push({
					type: "agent:error",
					sessionId,
					error: new Error(msg.errorMessage ?? `LLM ${msg.stopReason}`),
				});
			}

			// turn 内聚合文本 → agent:message_complete
			const text = extractText(msg);
			if (text.length > 0) {
				events.push({
					type: "agent:message_complete",
					sessionId,
					content: text,
				});
			}

			return events;
		}

		// ——— 消息生命周期 ———
		case "message_start":
			return [
				{ type: "agent:message_start", sessionId, role: event.message.role },
			];

		case "message_update": {
			const ae = event.assistantMessageEvent;
			if (ae.type === "text_delta") {
				return [{ type: "agent:message_delta", sessionId, delta: ae.delta }];
			}
			return [];
		}

		// ——— 工具调用生命周期 ———
		case "tool_execution_start":
			return [
				{
					type: "agent:toolCall_start",
					sessionId,
					toolName: event.toolName,
					callId: event.toolCallId,
				},
			];

		case "tool_execution_update":
			return [
				{
					type: "agent:toolCall_delta",
					sessionId,
					callId: event.toolCallId,
					partialResult: JSON.stringify(event.partialResult),
				},
			];

		case "tool_execution_end":
			return [
				{
					type: "agent:toolCall_end",
					sessionId,
					callId: event.toolCallId,
					result: JSON.stringify(event.result),
					success: !event.isError,
				},
			];

		default:
			return [];
	}
}
