/**
 * 复合模式 BorderedBox
 *
 * 带标题的边框容器。两种 variant：
 *  - primary:   rounded + 强调色边框（vivlos 外层主卡片）
 *  - secondary: single  + 次级色边框（推理过程内层卡片）
 *
 * 内部用 VBox 原子组件，颜色从 token 读取。
 */

import { colors } from "../colors";
import { theme } from "../theme";
import { VBox } from "../primitives/VBox";

export interface BorderedBoxProps {
  children?: unknown;
  /** 边框标题 */
  title?: string;
  /** 样式变体 */
  variant?: "primary" | "secondary";
}

export function BorderedBox({
  title,
  variant = "primary",
  children,
}: BorderedBoxProps) {
  const isPrimary = variant === "primary";

  return (
    <VBox
      title={title}
      borderStyle={isPrimary ? theme.border.outer : theme.border.inner}
      borderColor={isPrimary ? colors.border.primary : colors.border.secondary}
      padding={theme.spacing.md}
    >
      {children}
    </VBox>
  );
}
