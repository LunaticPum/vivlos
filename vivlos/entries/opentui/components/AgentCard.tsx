/**
 * 组装层 AgentCard
 *
 * Agent 响应卡片：MessageCard(vivlos) + AgentLog + markdown。
 * thinking/tool 直接显示，不加推理过程内框。
 */

import type { LogEntry } from "../hooks/useAgent";
import { SyntaxStyle } from "@opentui/core";
import { colors } from "../ui/colors";
import { MessageCard } from "../ui/patterns/MessageCard";
import { AgentLog } from "./AgentLog";

const defaultSyntax = SyntaxStyle.create();

export function AgentCard({
  logs,
  finalText,
  spin,
}: {
  logs: LogEntry[];
  finalText: string;
  spin: string;
}) {
  return (
    <MessageCard sender="vivlos">
      {logs.length > 0 && <AgentLog logs={logs} spin={spin} />}
      {finalText && <markdown content={finalText} syntaxStyle={defaultSyntax} />}
    </MessageCard>
  );
}
