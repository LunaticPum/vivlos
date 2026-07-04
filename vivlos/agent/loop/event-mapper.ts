import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { VivlosEvent } from "@vivlos/infra/eventbus/types.ts";

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
		const c = message.content;
		return c
			.filter((t): t is TextContent => t.type === "text")
			.map((t) => t.text)
			.join("");
	}

	return "";
}

/** pi AgentEvent 映射成 VivlosEvent */
export function mapAgentEvent(
	event: AgentEvent,
	sessionId: string,
	turn: number,
): VivlosEvent[] {
	switch (event.type) {
		case "agent_start":
			return [{ type: "agent:start", sessionId }];

		case "turn_start":
			return [{ type: "agent:turn_start", sessionId, turn }];

		case "turn_end": {
			const events: VivlosEvent[] = [
				{ type: "agent:turn_complete", sessionId, turn },
			];

			// stopReason 为 error/aborted 时，额外发 agent:error
			// TODO: stopReason 处理待完善——目前只区分 error/aborted vs 正常，
			// 后续需要覆盖：length（截断）、toolUse（工具调用完成继续 loop）等场景，
			// 以及 aborted 的具体原因（用户取消 vs 超时 vs signal）。
			// 见 pi types.ts StopReason 定义。
			const msg = event.message;
			if (msg.role === "assistant" && (msg.stopReason === "error" || msg.stopReason === "aborted")) {
				events.push({
					type: "agent:error",
					sessionId,
					error: new Error(msg.errorMessage ?? `LLM ${msg.stopReason}`),
				});
			} else {
				// 正常流程才发 text:complete（error 时文本通常为空）
				const text = extractText(event.message);
				if (text.length > 0) {
					events.push({ type: "text:complete", sessionId, content: text });
				}
			}
			return events;
		}

		case "message_update": {
			const ae = event.assistantMessageEvent;
			if (ae.type === "text_delta") {
				return [{ type: "text:delta", sessionId, delta: ae.delta }];
			}
			return [];
		}

		case "message_start":
		case "message_end":
			return [];

		case "tool_execution_start":
			return [
				{
					type: "tool:call_start",
					sessionId,
					toolName: event.toolName,
					callId: event.toolCallId,
				},
			];

		case "tool_execution_end":
			return [
				{
					type: "tool:call_end",
					sessionId,
					callId: event.toolCallId,
					success: !event.isError,
				},
			];

		case "tool_execution_update":
			return [];

		case "agent_end": {
			const lastMsg = event.messages[event.messages.length - 1];
			const finalMessage = lastMsg ? extractText(lastMsg) : "";
			return [{ type: "agent:complete", sessionId, finalMessage }];
		}

		default:
			return [];
	}
}
