import type { Message } from "@earendil-works/pi-ai";
import type { VivlosSession } from "./types.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";

export function createMemorySession(id?: string): VivlosSession {
	let messages: Message[] = [];
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
