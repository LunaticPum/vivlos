import { Chat } from "./containers/chat/ChatPanel";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { LLMConfigRepository } from "@vivlos/infra/storage/index.ts";

const C = {
	bg: "#24273a",
} as const;

export function App({
	modelLabel,
	agent,
	eventBus,
	llm,
	llmConfigRepo,
	onExit,
}: {
	modelLabel: string;
	agent: VivlosAgent;
	eventBus: EventBus;
	llm: LLMClient;
	llmConfigRepo: LLMConfigRepository;
	onExit: () => void;
}) {
	return (
		<box backgroundColor={C.bg} width={"100%"} height={"100%"}>
			<Chat
				modelLabel={modelLabel}
				agent={agent}
				eventBus={eventBus}
				llm={llm}
				llmConfigRepo={llmConfigRepo}
				onExit={onExit}
			/>
		</box>
	);
}
