/**
 * App 顶层布局
 *
 * StatusBar（顶） + ChatArea（中，flexGrow） + InputBar（底）
 * useAgent hook 桥接事件流，消息历史本地 state。
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

  return (
    <VBox flexDirection="column">
      <StatusBar modelLabel={modelLabel} status={status} />
      <ChatArea messages={messages} logs={logs} finalText={finalText} spin={spin} />
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
