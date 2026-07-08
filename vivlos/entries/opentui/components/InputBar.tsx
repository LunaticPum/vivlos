/**
 * 组装层 InputBar
 *
 * 底部输入栏：OpenTUI <input> + 发送逻辑。
 * loading 时禁用输入，onSubmit 回调提交文本。
 */

import { colors } from "../ui/colors";
import { VBox } from "../ui/primitives/VBox";

export function InputBar({
  loading,
  onSubmit,
}: {
  /** 是否正在等待 agent 回复 */
  loading: boolean;
  /** 用户按 Enter 时调用 */
  onSubmit: (text: string) => void;
}) {
  return (
    <VBox
      height={3}
      borderStyle="single"
      borderColor={colors.border.secondary}
    >
      <input
        placeholder={loading ? "请等待回复..." : "输入消息... (Enter 发送)"}
        onSubmit={(value: string) => onSubmit(value)}
        backgroundColor={loading ? colors.bg.inputFocus : undefined}
        textColor={loading ? colors.text.muted : colors.text.primary}
      />
    </VBox>
  );
}
