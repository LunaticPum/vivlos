/**
 * 组装层 AgentCard
 *
 * Agent 响应卡片：MessageCard 外套 + 推理过程内框 + markdown 回复。
 * 对应旧 pi-tui AgentStatusBorder 的完整渲染。
 */

import type { LogEntry } from "../hooks/useAgent";
import { MessageCard } from "../ui/patterns/MessageCard";
import { AgentLog } from "./AgentLog";

export function AgentCard({
  logs,
  finalText,
  spin,
}: {
  logs: LogEntry[];
  finalText: string;
  spin: string;
}) {
  const hasLogs = logs.length > 0;

  return (
    <MessageCard sender="vivlos">
      {hasLogs && <ThinkingList logs={logs} spin={spin} />}
      {finalText && <markdown content={finalText} />}
    </MessageCard>
  );
}
