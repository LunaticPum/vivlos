import type { Message } from "@earendil-works/pi-ai";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { LoopResult } from "./loop/types.ts";

/** agent 对外接口 —— entries 层 */
export interface VivlosAgent {
	prompt(input: string | AgentMessage[]): Promise<LoopResult>;
	getMessages(): readonly Message[];
	reset(): void;
}