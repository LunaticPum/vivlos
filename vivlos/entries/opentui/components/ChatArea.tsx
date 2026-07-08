/**
 * 组装层 ChatArea
 *
 * 聊天内容区：用户消息列表 + 当前 Agent 响应。
 * flexGrow:1 填充 StatusBar 和 InputBar 之间的空间。
 */

import type { LogEntry } from "../hooks/useAgent";
import { VBox } from "../ui/primitives/VBox";
import { UserMessage } from "../ui/patterns/UserMessage";
import { AgentCard } from "./AgentCard";

export function ChatArea({
  messages,
  logs,
  finalText,
  spin,
}: {
  messages: string[];
  logs: LogEntry[];
  finalText: string;
  spin: string;
}) {
  return (
    <VBox flexDirection="column" flexGrow={1}>
      {messages.map((msg, i) => (
        <UserMessage key={i} text={msg} />
      ))}
      {(logs.length > 0 || finalText) ? (
        <AgentCard logs={logs} finalText={finalText} spin={spin} />
      ) : null}
    </VBox>
  );
}
