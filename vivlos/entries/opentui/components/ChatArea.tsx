/**
 * 组装层 ChatArea
 *
 * 聊天内容区 + 滚动。stickyScroll 新消息自动滚到底部。
 */

import type { LogEntry } from "../hooks/useAgent";
import { VText } from "../ui/primitives/VText";
import { MessageCard } from "../ui/patterns/MessageCard";
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
    <scrollbox stickyScroll stickyStart="bottom" flexGrow={1}>
      {messages.map((msg, i) => (
        <MessageCard key={`msg-${i}`} sender="You">
          <VText content={msg} />
        </MessageCard>
      ))}
      {(logs.length > 0 || finalText) ? (
        <AgentCard logs={logs} finalText={finalText} spin={spin} />
      ) : null}
    </scrollbox>
  );
}
