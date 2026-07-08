/**
 * 原子组件 VText
 *
 * 封装 OpenTUI <text>，注入 vivlos 默认前景色。
 * Props 继承 @opentui/react 的 TextProps，只覆盖 fg 默认值。
 */

import type { TextProps } from "@opentui/react";
import { colors } from "../colors";

export function VText({ fg = colors.text.primary, ...rest }: TextProps) {
  return <text fg={fg} {...rest} />;
}
