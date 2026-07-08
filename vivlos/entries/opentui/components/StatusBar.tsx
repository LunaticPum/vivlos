/**
 * 组装层 StatusBar
 *
 * 顶部单行状态栏：左侧 vivlos · 模型名，右侧状态提示。
 */

import { colors } from "../ui/colors";
import { VBox } from "../ui/primitives/VBox";
import { VText } from "../ui/primitives/VText";

export function StatusBar({
  modelLabel,
  status,
}: {
  modelLabel: string;
  status: string;
}) {
  return (
    <VBox
      height={1}
      flexDirection="row"
      borderStyle="single"
      borderColor={colors.border.secondary}
    >
      <VText
        content={` vivlos · ${modelLabel} `}
        fg={colors.accent.bright}
      />
      {status ? (
        <VText content={` ${status}`} fg={colors.semantic.warning} />
      ) : null}
    </VBox>
  );
}
