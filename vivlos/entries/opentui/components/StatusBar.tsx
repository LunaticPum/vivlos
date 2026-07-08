/**
 * StatusBar — 底部状态栏
 *
 * 对齐 pi-tui：── model: provider/model ──────
 */

import { colors } from "../ui/colors";
import { useTerminalDimensions } from "@opentui/react";

export function StatusBar({
  modelLabel,
  status,
}: {
  modelLabel: string;
  status: string;
}) {
  const { width } = useTerminalDimensions();
  const label = `── model: ${modelLabel}`;
  const dashPad = Math.max(0, (width ?? 80) - label.length - 2);
  const line = `${label} ${"─".repeat(dashPad)}`;

  return (
    <box height={1}>
      {status ? <text content={` ${status}`} fg={colors.semantic.warning} /> : null}
      <text content={line} fg={colors.text.secondary} />
    </box>
  );
}
