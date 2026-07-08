/**
 * 组装层 InputBar
 *
 * 底部输入栏。用 onInput 跟踪文本，Enter 时无参 onSubmit 提交。
 * 参照 OpenTUI skill docs/bindings/react.mdx 的 Login form 示例：
 *   <input onInput={setUsername} onSubmit={handleSubmit} />
 */

import { useState } from "react";
import { colors } from "../ui/colors";
import { VBox } from "../ui/primitives/VBox";

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
    <VBox
      height={3}
      borderStyle="single"
      borderColor={colors.border.secondary}
    >
      <input
        placeholder={loading ? "请等待回复..." : "输入消息... (Enter 发送)"}
        onInput={setText}
        onSubmit={handleSubmit}
        backgroundColor={loading ? colors.bg.inputFocus : undefined}
        textColor={loading ? colors.text.muted : colors.text.primary}
      />
    </VBox>
  );
}
