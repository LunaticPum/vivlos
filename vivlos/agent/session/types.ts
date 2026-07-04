import type { AgentMessage } from "@earendil-works/pi-agent-core";

export interface VivlosSession {
	readonly id: string;
	getMessages(): readonly AgentMessage[];
	appendMessage(message: AgentMessage): void;
	reset(): void;
}
