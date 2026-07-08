/**
 * 组装层 AgentCard
 *
 * Agent 响应卡片：
 *  MessageCard(vivlos) 外套
 *    → VBox("推理过程") 内框 + AgentLog
 *    → <markdown> 回复
 *
 * 对应旧 pi-tui AgentStatusBorder 的完整渲染。
 */

import type { LogEntry } from "../hooks/useAgent";
import { SyntaxStyle } from "@opentui/core";
import { colors } from "../ui/colors";
import { theme } from "../ui/theme";
import { VBox } from "../ui/primitives/VBox";
import { MessageCard } from "../ui/patterns/MessageCard";
import { AgentLog } from "./AgentLog";

/** 默认语法样式（markdown 组件必需） */
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
  const hasLogs = logs.length > 0;

  return (
    <MessageCard sender="vivlos">
      {hasLogs && (
        <VBox
          title="推理过程"
          borderStyle={theme.border.inner}
          borderColor={colors.border.secondary}
        >
          <AgentLog logs={logs} spin={spin} />
        </VBox>
      )}
      {finalText && <markdown content={finalText} syntaxStyle={defaultSyntax} />}
    </MessageCard>
  );
}
