/**
 * App 顶层布局
 *
 * ChatArea（中，flexGrow + scrollbox） + StatusBar（底） + InputBar（底）
 */

import { useState } from "react";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import { useAgent } from "./hooks/useAgent";
import { VBox } from "./ui/primitives/VBox";
import { StatusBar } from "./components/StatusBar";
import { ChatArea } from "./components/ChatArea";
import { InputBar } from "./components/InputBar";

export function App({
  agent,
  eventBus,
  modelLabel,
}: {
  agent: VivlosAgent;
  eventBus: EventBus;
  modelLabel: string;
}) {
  const { logs, finalText, loading, status, submit, spin } = useAgent(agent, eventBus);
  const [messages, setMessages] = useState<string[]>([]);

  return (
    <VBox flexDirection="column">
      <ChatArea messages={messages} logs={logs} finalText={finalText} spin={spin} />
      <StatusBar modelLabel={modelLabel} status={status} />
      <InputBar
        loading={loading}
        onSubmit={(text) => {
          setMessages((prev) => [...prev, text]);
          submit(text);
        }}
      />
    </VBox>
  );
}
