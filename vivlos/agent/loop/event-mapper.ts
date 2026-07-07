import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { VivlosEvent } from "@vivlos/infra/eventbus/types.ts";

function extractText(message: AgentMessage): string {
	if (message.role === "user") {
		const c = message.content;
		return typeof c === "string" ? c : c.filter((t): t is TextContent => t.type === "text").map((t) => t.text).join("");
	}
	if (message.role === "assistant") {
		return message.content.filter((t): t is TextContent => t.type === "text").map((t) => t.text).join("");
	}
	return "";
}

function extractThinking(message: AgentMessage): string {
	if (message.role !== "assistant") return "";
	return message.content.filter((c) => c.type === "thinking").map((c) => (c as { thinking: string }).thinking).join("\n");
}

export function mapAgentEvent(event: AgentEvent, sessionId: string, turn: number): VivlosEvent[] {
	switch (event.type) {
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
			const events: VivlosEvent[] = [{ type: "agent:turn_complete", sessionId, turn }];
			const msg = event.message;
			if (msg.role === "assistant" && (msg.stopReason === "error" || msg.stopReason === "aborted")) {
				events.push({ type: "agent:error", sessionId, error: new Error(msg.errorMessage ?? `LLM ${msg.stopReason}`) });
			}
			const text = extractText(msg);
			const thinking = extractThinking(msg);
			events.push({ type: "agent:message_complete", sessionId, content: text, thinkingContent: thinking });
			return events;
		}
		case "message_start":
			return [{ type: "agent:message_start", sessionId, role: event.message.role }];
		case "message_update": {
			const ae = event.assistantMessageEvent;
			if (ae.type === "thinking_delta") return [{ type: "agent:thinking_delta", sessionId, delta: ae.delta, messageSnapshot: event.message }];
			if (ae.type === "thinking_end") return [{ type: "agent:thinking_delta", sessionId, delta: ae.content, messageSnapshot: event.message }];
			if (ae.type === "text_delta") return [{ type: "agent:message_delta", sessionId, delta: ae.delta, messageSnapshot: event.message }];
			return [];
		}
		case "tool_execution_start":
			return [{ type: "agent:toolCall_start", sessionId, toolName: event.toolName, callId: event.toolCallId }];
		case "tool_execution_update":
			return [{ type: "agent:toolCall_delta", sessionId, callId: event.toolCallId, partialResult: event.partialResult }];
		case "tool_execution_end":
			return [{ type: "agent:toolCall_end", sessionId, callId: event.toolCallId, result: event.result, success: !event.isError }];
		default:
			return [];
	}
}