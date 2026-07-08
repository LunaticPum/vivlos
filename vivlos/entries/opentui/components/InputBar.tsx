/**
 * InputBar — 底部输入栏
 *
 * 对齐 pi-tui：> 提示符同行 + input + 底部横线
 */

import { useState } from "react";
import { colors } from "../ui/colors";
import { VDivider } from "../ui/primitives/VDivider";

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
      void onSubmit(trimmed);
      setText("");
    }
  };

  return (
    <box flexDirection="column">
      <VDivider />
      <box flexDirection="row">
        <text content="> " fg={colors.accent.bright} />
        <input
          focused
          value={text}
          onInput={setText}
          onSubmit={handleSubmit}
          textColor={loading ? colors.text.muted : colors.text.primary}
        />
      </box>
      <VDivider />
    </box>
  );
}
