/**
 * 原子组件 VBox
 *
 * 封装 OpenTUI <box>，注入 vivlos 默认边框样式和间距。
 * 组件层直接用 <VBox>，不需要每次写 borderStyle/padding/borderColor。
 * 其余 props 透传原生 <box>，类型由 OpenTUI JSX 类型推断。
 */

import { colors } from "../colors";
import { theme } from "../theme";

type BorderStyleVariant = "single" | "double" | "rounded" | "heavy";

export function VBox(props: {
  /** 边框样式，默认 rounded */
  borderStyle?: BorderStyleVariant;
  /** 内边距，默认 sm(1) */
  padding?: number;
  /** 边框颜色，默认 primary */
  borderColor?: string;
  /** 标题（显示在边框左上角） */
  title?: string;
  /** 主轴方向 */
  flexDirection?: "row" | "column";
  /** 背景色 */
  backgroundColor?: string;
  /** 子元素间距 */
  gap?: number;
  /** 向后兼容：透传其余 box props */
  [key: string]: unknown;
}) {
  const {
    borderStyle = theme.border.outer as BorderStyleVariant,
    padding = theme.spacing.sm,
    borderColor = colors.border.primary,
    ...rest
  } = props;

  return (
    <box
      borderStyle={borderStyle}
      padding={padding}
      borderColor={borderColor}
      {...rest}
    />
  );
}
