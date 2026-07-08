/**
 * 原子组件 VBox
 *
 * 封装 OpenTUI <box>，注入 vivlos 默认边框样式和间距。
 * Props 直接继承 @opentui/react 的 BoxProps，
 * 只覆盖 borderStyle/padding/borderColor 三个默认值。
 * 其余所有属性（width/height/flexGrow/gap/title 等）透传原生 <box>。
 */

import type { BoxProps } from "@opentui/react";
import { colors } from "../colors";
import { theme } from "../theme";

export function VBox({
  borderStyle = theme.border.outer,
  padding = theme.spacing.sm,
  borderColor = colors.border.primary,
  ...rest
}: BoxProps) {
  return (
    <box
      borderStyle={borderStyle}
      padding={padding}
      borderColor={borderColor}
      {...rest}
    />
  );
}
