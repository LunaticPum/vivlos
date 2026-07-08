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

  return (
    <box flexDirection="column">
      <VDivider />
      <text content="> " fg={colors.accent.bright} />
      <box>
        <input
          focused
          onInput={setText}
          onSubmit={() => {
            const trimmed = text.trim();
            if (trimmed) { void onSubmit(trimmed); setText(""); }
          }}
          placeholder={loading ? "请等待回复..." : undefined}
        />
      </box>
      <VDivider />
    </box>
  );
}
