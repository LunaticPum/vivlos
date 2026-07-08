/**
 * 组装层 InputBar
 *
 * 底部输入栏。loading 时占位文案提示等待，Enter 提交。
 * 参照 OpenTUI skill docs/bindings/react.mdx 的 Login form 示例。
 */

import { colors } from "../ui/colors";
import { VBox } from "../ui/primitives/VBox";

export function InputBar({
  loading,
  onSubmit,
}: {
  loading: boolean;
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
        onSubmit={onSubmit}
        backgroundColor={loading ? colors.bg.inputFocus : undefined}
        textColor={loading ? colors.text.muted : colors.text.primary}
      />
    </VBox>
  );
}
