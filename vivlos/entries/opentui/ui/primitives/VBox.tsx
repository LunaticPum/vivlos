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
  borderStyle?: "rounded" | "single" | "double" | "none" | "bold" | "hidden";
  padding?: number;
  title?: string;
  flexDirection?: "row" | "column";
  height?: number | string;
  width?: number | string;
  flexGrow?: number;
  borderColor?: string;
  backgroundColor?: string;
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
