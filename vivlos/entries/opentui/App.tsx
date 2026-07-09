import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { ChatArea } from "./containers/chat/ChatArea";
import { StatusBar } from "./containers/chat/StatusBar";
import { InputBar } from "./containers/chat/InputBar";
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
	const { turns, loading, error, submit, abort } = useAgent(agent, eventBus);
	const [detailExpanded, setDetailExpanded] = useState(false);

	// Ctrl+C: loading 时打断 LLM，idle 时退出程序
	useKeyboard((key) => {
		if (key.ctrl && key.name === "c") {
			if (loading) {
				abort();
			} else {
				process.emit("SIGINT");
			}
		}
	});

	return (
		<box flexDirection="column" width="100%" height="100%">
			<ChatArea turns={turns} detailExpanded={detailExpanded} />
			<StatusBar modelLabel={modelLabel} loading={loading} error={error} />
			<InputBar
				onSubmit={(text) => {
					if (text === "/detail") {
						setDetailExpanded((v) => !v);
						return;
					}
					submit(text);
				}}
			/>
		</box>
	);
}
