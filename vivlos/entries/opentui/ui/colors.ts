export const colors = {
  text: {
    primary: "#D4D4D4",
    secondary: "#808080",
    muted: "#666666",
  },
  accent: {
    primary: "#00FFFF",
    bright: "#00FFFF",
  },
  semantic: {
    success: "#33CC33",
    thinking: "#87FF87",
    tool: "#D7AFFF",
    toolName: "#FF8800",
    error: "#CC6666",
    warning: "#FFFF00",
  },
  code: {
    inline: "#00AAAA",
    block: "#87FF87",
  },
  border: {
    primary: "#00FFFF",
    secondary: "#808080",
    divider: "#808080",
  },
  bg: {
    userMessage: "#343541",
    codeBlock: "#303030",
    inputFocus: "#2A2A2A",
  },
} as const;

export type ColorTokens = typeof colors;
