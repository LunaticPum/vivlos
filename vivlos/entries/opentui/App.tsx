import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { ChatArea } from "./containers/chat/ChatArea";
import { StatusBar } from "./containers/chat/StatusBar";
import { InputBar } from "./containers/chat/InputBar";
import { InfoBar } from "./containers/chat/InfoBar";
import { useAgent } from "./hooks/useAgent";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";

export function App({
	modelLabel,
	agent,
	eventBus,
}: {
	modelLabel: string;
	agent: VivlosAgent;
	eventBus: EventBus;
}) {
	const { conversationTurns, loading, error, submit, abort } = useAgent(
		agent,
		eventBus,
	);

	const [detailExpanded, setDetailExpanded] = useState(false);

	const hasCompletedConversation = conversationTurns.some(
		(t) => t.status === "complete",
	);

	// TODO: 双重 Ctrl+C 确认退出机制（idle 时第一次提示，第二次才 emit SIGINT）

	return (
		<box flexDirection="column" width="100%" height="100%">
			<ChatArea
				conversationTurns={conversationTurns}
				detailExpanded={detailExpanded}
			/>
			<StatusBar
				modelLabel={modelLabel}
				loading={loading}
				error={error}
				turnStatus={conversationTurns.length > 0 ? conversationTurns[conversationTurns.length - 1]!.status : undefined}
			/>
			<InputBar
				onSubmit={(text) => {
					if (text === "/detail") {
						setDetailExpanded((v) => !v);
						return;
					}
					submit(text);
				}}
				onEsc={() => {
					if (loading) abort();
				}}
			/>
			<InfoBar
				// loading={true}
				loading={loading}
				detailExpanded={detailExpanded}
				hasCompletedConversation={hasCompletedConversation}
			/>
		</box>
	);
}
