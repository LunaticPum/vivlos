/**
 * 复合模式 MessageCard
 *
 * 聊天气泡卡片。两种 sender：
 *  - "You"    用户消息：次级边框色
 *  - "vivlos" Agent 回复：强调色边框
 *
 * 两者均为 rounded 边框 + 无背景 + 左上角 title。
 * 推理过程/工具日志等内部内容通过 children 传入。
 */

import { colors } from "../colors";
import { VBox } from "../primitives/VBox";

export function MessageCard({
  sender,
  children,
}: {
  /** 发送者：You → 用户消息，vivlos → Agent 回复 */
  sender: "You" | "vivlos";
  children?: unknown;
}) {
  const isAgent = sender === "vivlos";

  return (
    <VBox
      title={sender}
      borderStyle="rounded"
      borderColor={isAgent ? colors.border.primary : colors.border.secondary}
    >
      {children}
    </VBox>
  );
}
