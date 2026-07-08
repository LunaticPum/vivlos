/**
 * 原子组件 VText
 *
 * 封装 OpenTUI <text>，注入 vivlos 默认前景色。
 * 组件层直接用 <VText>，不需要每次写 fg。
 */

import { colors } from "../colors";

export interface VTextProps {
  /** 文本内容（OpenTUI <text> 的 content prop） */
  content?: string;
  children?: unknown;
  /** 前景色，默认 primary */
  fg?: string;
  /** 背景色 */
  bg?: string;
  /** 加粗 */
  bold?: boolean;
  /** 斜体 */
  italic?: boolean;
}

export function VText({ fg = colors.text.primary, ...rest }: VTextProps) {
  return <text fg={fg} {...rest} />;
}
