/**
 * 复合模式 LogLine
 *
 * 推理日志单一条目。根据 kind 分支：
 *  - thinking: 标题行 + 续行（┆ + text），text 换行展示
 *  - tool:     单行 → icon + "Calling " + 橙色 toolName，
 *              完成时 toolResult 同行追加
 *
 * 图标变更和结果追加时机由上层（useAgent/ThinkingList）控制，
 * LogLine 只负责渲染当前传入的 props。
 */

import { colors } from "../colors";
import { VText } from "../primitives/VText";

export function LogLine({
  kind,
  icon,
  text,
  toolName,
  toolResult,
}: {
  kind: "thinking" | "tool";
  /** 图标：⠋（进行中）或 ✓（完成） */
  icon: string;
  /** thinking 文本，可能多行 */
  text?: string;
  /** 工具名 */
  toolName?: string;
  /** 工具结果，存在则追加到 Calling 同行 */
  toolResult?: string;
}) {
  if (kind === "thinking") {
    const lines = text?.split("\n") ?? [];
    return (
      <>
        <VText
          fg={colors.semantic.thinking}
          content={`${icon} Thinking...`}
        />
        {lines.map((line, i) => (
          <VText
            key={i}
            fg={colors.semantic.thinking}
            content={`  ┆ ${line}`}
          />
        ))}
      </>
    );
  }

  // tool
  const tail = toolResult
    ? `  ${toolResult}`
    : "";

  return (
    <VText fg={colors.semantic.tool}>
      {icon} Calling{" "}
      <text fg={colors.semantic.toolName}>{toolName ?? ""}</text>
      <text fg={colors.text.secondary}>{tail}</text>
    </VText>
  );
}
