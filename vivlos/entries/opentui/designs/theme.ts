/**
 * vivlos OpenTUI 主题 token
 *
 * 间距、尺寸、边框等非颜色样式统一收敛在此。
 * 组件层不写 magic number，只引用这些 token。
 */

export const theme = {
  // ── 间距 ──
  spacing: {
    /** 0 间距 */
    none: 0,
    /** 4px 等效（终端行内最窄间距） */
    xs: 0,
    /** 1 行/列 */
    sm: 1,
    /** 2 行/列 */
    md: 2,
    /** 4 行/列 */
    lg: 4,
  },

  // ── 边框 ──
  border: {
    /** 外框样式（vivlos 主卡片） */
    outer: "rounded",
    /** 内框样式（推理过程） */
    inner: "single",
    /** 用户消息边框 */
    userMessage: "rounded",
  },

  // ── 组件尺寸 ──
  size: {
    /** 状态栏高度（行） */
    statusBar: 1,
    /** 输入栏高度（行） */
    inputBar: 3,
    /** 输入框宽度（列），后续改为百分比 */
    inputWidth: 60,
  },

  // ── 分隔线 ──
  divider: {
    /** 分隔线宽度（列数） */
    width: 40,
  },

  // ── 动画 ──
  animation: {
    /** spinner 切换间隔 (ms) */
    spinnerInterval: 400,
  },
} as const;

export type ThemeTokens = typeof theme;
