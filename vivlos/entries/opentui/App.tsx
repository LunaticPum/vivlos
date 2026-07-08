/**
 * 组装层 App
 *
 * 顶层布局：StatusBar + ChatArea + InputBar，纵向 Flexbox。
 * useAgent hook 桥接事件流，分发给各子组件。
 */

import { useState } from "react";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import { useAgent } from "../hooks/useAgent";
import { VBox } from "../ui/primitives/VBox";
import { StatusBar } from "./StatusBar";
import { ChatArea } from "./ChatArea";
import { InputBar } from "./InputBar";

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

  const handleSubmit = (text: string) => {
    setMessages((prev) => [...prev, text]);
    submit(text);
  };

  return (
    <VBox flexDirection="column" height="100%">
      <StatusBar modelLabel={modelLabel} status={status} />
      <ChatArea messages={messages} logs={logs} finalText={finalText} spin={spin} />
      <InputBar loading={loading} onSubmit={handleSubmit} />
    </VBox>
  );
}
