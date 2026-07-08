/**
 * vivlos OpenTUI 色板
 *
 * 语义化命名，不直接暴露 hex 值给组件层。
 * 所有颜色统一在这里定义，组件通过 token 引用。
 */

export const colors = {
  // ── 文本 ──
  text: {
    /** 正文（用户消息、agent 回复） */
    primary: "#D4D4D4",
    /** 辅助文本（状态栏、placeholder） */
    secondary: "#808080",
    /** 反色文本（深色背景上） */
    muted: "#666666",
  },

  // ── 强调色 ──
  accent: {
    /** 主强调（边框、标题、链接） */
    primary: "#00AAAA",
    /** 强调高亮 */
    bright: "#00FFFF",
  },

  // ── 语义色 ──
  semantic: {
    /** 成功/完成 */
    success: "#33CC33",
    /** 推理/思考 */
    thinking: "#87FF87",
    /** 工具调用 */
    tool: "#D7AFFF",
    /** 错误 */
    error: "#CC6666",
    /** 警告 */
    warning: "#FFFF00",
  },

  // ── 代码 ──
  code: {
    /** 行内代码 */
    inline: "#00AAAA",
    /** 代码块文本 */
    block: "#87FF87",
  },

  // ── 边框 ──
  border: {
    /** 外框主边框（vivlos 卡片） */
    primary: "#00AAAA",
    /** 内框副边框（推理过程） */
    secondary: "#808080",
    /** 分隔线 */
    divider: "#808080",
  },

  // ── 背景 ──
  bg: {
    /** 用户消息背景（暖色） */
    userMessage: "#343541",
    /** 代码块暗色背景 */
    codeBlock: "#303030",
    /** 输入框获焦背景 */
    inputFocus: "#2A2A2A",
  },
} as const;

/** 色板类型，供 theme 引用 */
export type ColorTokens = typeof colors;
