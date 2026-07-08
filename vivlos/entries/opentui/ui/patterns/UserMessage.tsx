/**
 * 复合模式 UserMessage
 *
 * 用户消息卡片：带边框、暗色背景、左对齐文本。
 * 对应旧 pi-tui 的 BorderedMessage("You", text, "yellow")。
 */

import { colors } from "../colors";
import { theme } from "../theme";
import { VBox } from "../primitives/VBox";
import { VText } from "../primitives/VText";

export function UserMessage({ text }: { text: string }) {
  return (
    <VBox
      title="You"
      borderStyle={theme.border.userMessage}
      backgroundColor={colors.bg.userMessage}
      borderColor={colors.border.secondary}
      padding={theme.spacing.sm}
    >
      <VText content={text} />
    </VBox>
  );
}
