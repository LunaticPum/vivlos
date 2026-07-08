/**
 * App 顶层布局
 *
 * ChatArea（中，flexGrow + scrollbox） + StatusBar（底） + InputBar（底）
 */

import { useState } from "react";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { SessionManager } from "@vivlos/agent/session/index.ts";
import type { MemoryManager } from "@vivlos/agent/memory/index.ts";
import type { CommandRegistry } from "@vivlos/commands/registry.ts";
import { useAgent } from "./hooks/useAgent";
import { useCommands } from "./hooks/useCommands";
import { StatusBar } from "./components/StatusBar";
import { ChatArea } from "./components/ChatArea";
import { InputBar } from "./components/InputBar";

export function App({
  agent,
  eventBus,
  modelLabel,
  llm,
  sessionManager,
  memoryManager,
  registry,
  shutdown,
}: {
  agent: VivlosAgent;
  eventBus: EventBus;
  modelLabel: string;
  llm: LLMClient;
  sessionManager: SessionManager;
  memoryManager: MemoryManager;
  registry: CommandRegistry;
  shutdown: () => void;
}) {
  const { logs, finalText, loading, status, submit, spin } = useAgent(agent, eventBus);
  const [messages, setMessages] = useState<string[]>([]);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [cmdFeedback, setCmdFeedback] = useState("");

  const handleCommand = useCommands({
    registry, llm, eventBus, sessionManager, memoryManager,
    shutdown, detailExpanded,
    onToggleDetail: () => setDetailExpanded((v) => !v),
    onClear: () => setMessages([]),
  });

  const handleSubmit = async (text: string) => {
    const cmd = await handleCommand(text);
    if (cmd.handled) {
      setCmdFeedback(cmd.feedback ?? "");
      return;
    }
    setCmdFeedback("");
    setMessages((prev) => [...prev, text]);
    submit(text);
  };

  return (
    <box flexDirection="column">
      <ChatArea messages={messages} logs={logs} finalText={finalText} spin={spin} />
      <StatusBar modelLabel={modelLabel} status={status || cmdFeedback} />
      <InputBar loading={loading} onSubmit={handleSubmit} />
    </box>
  );
}
