/**
 * 复合模式 LogEntry
 *
 * 推理日志条目：thinking 和 tool 两种类型。
 * thinking: OpenTUI 内置 <markdown> 组件渲染推理文本
 * tool: 紫色工具名 + 灰色结果摘要
 *
 * 对应旧 pi-tui AgentStatusBorder 里的 thinking/tool body 行。
 */

import { colors } from "../colors";
import { VText } from "../primitives/VText";

/** 日志条目类型，对齐旧 pi-tui LogEntry */
export type LogEntryData =
  | { kind: "thinking"; text: string; active?: boolean }
  | { kind: "tool"; name: string; result?: string; active?: boolean };

export function LogEntry({ entry }: { entry: LogEntryData }) {
  if (entry.kind === "thinking") {
    return (
      <VText
        fg={colors.semantic.thinking}
        content={entry.active ? `⠋ Thinking...` : `✓ Thinking...`}
      />
    );
  }

  // tool
  return (
    <VText
      fg={colors.semantic.tool}
      content={`✓ Calling ${entry.name}`}
    />
  );
}
