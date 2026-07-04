import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { VivlosSession } from "./types.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";

export function createMemorySession(id?: string): VivlosSession {
	let messages: AgentMessage[] = [];
	const sessionId = id ?? shortId();

	return {
		id: sessionId,
		getMessages() {
			return messages;
		},
		appendMessage(message) {
			messages = [...messages, message];
		},
		reset() {
			messages = [];
		},
	};
}
