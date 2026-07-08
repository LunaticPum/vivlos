/**
 * 组装层 StatusBar
 *
 * 顶部状态栏：模型名 + 状态提示。
 * height=1 单行，flexDirection="row" 左右分布。
 */

import { colors } from "../ui/colors";
import { VBox } from "../ui/primitives/VBox";
import { VText } from "../ui/primitives/VText";

export function StatusBar({
  modelLabel,
  status,
}: {
  /** 模型名，如 "deepseek-v4-pro" */
  modelLabel: string;
  /** 状态提示，空串时不显示 */
  status: string;
}) {
  return (
    <VBox
      height={1}
      flexDirection="row"
      borderStyle="single"
      borderColor={colors.border.secondary}
    >
      <VText content={` vivlos · ${modelLabel} `} fg={colors.accent.bright} />
      {status && (
        <VText content={` ⏳ ${status}`} fg={colors.semantic.warning} />
      )}
    </VBox>
  );
}
