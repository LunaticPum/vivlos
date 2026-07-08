/**
 * 原子组件 VDivider
 *
 * 水平分隔线。用 OpenTUI <text> + 横线字符实现，
 * 比 box+零高边框更可靠。
 */

import { colors } from "../colors";
import { theme } from "../theme";

export function VDivider({
  width = theme.divider.width,
  color = colors.border.divider,
}: {
  /** 分隔线宽度（列数），默认 40 */
  width?: number;
  /** 颜色 */
  color?: string;
}) {
  return <text content={"─".repeat(width)} fg={color} />;
}
