/**
 * InputBar — 底部输入栏
 *
 * 对齐 pi-tui：> 提示符 + input
 */

import { useState } from "react";
import { colors } from "../ui/colors";

export function InputBar({
  loading,
  onSubmit,
}: {
  loading: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setText("");
    }
  };

  return (
    <box flexDirection="column">
      <text
        content={loading ? "⏳ 请等待回复..." : "> 输入消息... (Enter 发送)"}
        fg={colors.accent.bright}
      />
      <input
        onInput={setText}
        onSubmit={handleSubmit}
        textColor={loading ? colors.text.muted : colors.text.primary}
      />
    </box>
  );
}
