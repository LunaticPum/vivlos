/**
 * 复合模式 MessageCard
 *
 * 聊天气泡卡片。两种 sender：
 *  - "You"    用户消息：次级边框色
 *  - "vivlos" Agent 回复：强调色边框
 *
 * children 类型由 VBox（BoxProps）透传，不自定义覆盖。
 */

import { colors } from "../colors";
import { VBox } from "../primitives/VBox";
import type { ReactNode } from "react";

export function MessageCard({
  sender,
  children,
}: {
  sender: "You" | "vivlos";
  children?: ReactNode;
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
