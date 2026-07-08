/**
 * 原子组件 VDivider
 *
 * 水平分隔线。用空 box + 底部单线边框实现。
 */

import { colors } from "../colors";
import { theme } from "../theme";

export interface VDividerProps {
  /** 分隔线宽度（列数），默认 40 */
  width?: number;
  /** 颜色 */
  color?: string;
}

export function VDivider({
  width = theme.divider.width,
  color = colors.border.divider,
}: VDividerProps) {
  return (
    <box
      height={0}
      width={width}
      borderStyle="single"
      borderColor={color}
    />
  );
}
