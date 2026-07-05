import type { Message } from "@earendil-works/pi-ai";

export interface VivlosSession {
	readonly id: string;
	getMessages(): readonly Message[];
	appendMessage(message: Message): void;
	reset(): void;
}
