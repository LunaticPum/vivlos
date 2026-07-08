/**
 * 原子组件 VBox
 *
 * 封装 OpenTUI <box>，注入 vivlos 默认边框样式和间距。
 * 组件层直接用 <VBox>，不需要每次写 borderStyle/padding。
 */

import { colors } from "../colors";
import { theme } from "../theme";

export interface VBoxProps {
  children?: unknown;
  /** 边框样式，默认 rounded。OpenTUI 支持：single | double | rounded | heavy */
  borderStyle?: "single" | "double" | "rounded" | "heavy";
  /** 内边距，默认 sm(1) */
  padding?: number;
  /** 标题（显示在边框左上角） */
  title?: string;
  /** 主轴方向 */
  flexDirection?: "row" | "column";
  /** 高度 */
  height?: number | string;
  /** 宽度 */
  width?: number | string;
  /** flex-grow */
  flexGrow?: number;
  /** 边框颜色 */
  borderColor?: string;
  /** 背景色 */
  backgroundColor?: string;
  /** 子元素间距 */
  gap?: number;
}

export function VBox({
  borderStyle = theme.border.outer,
  padding = theme.spacing.sm,
  borderColor = colors.border.primary,
  ...rest
}: VBoxProps) {
  return (
    <box
      borderStyle={borderStyle}
      padding={padding}
      borderColor={borderColor}
      {...rest}
    />
  );
}
