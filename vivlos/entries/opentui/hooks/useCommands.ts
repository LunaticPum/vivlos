/**
 * useCommands hook — slash 命令适配层
 *
 * 将 vivlos/commands/ 的 CommandContext（依赖 pi-tui）桥接到 OpenTUI React state。
 * 不修改原有 commands 代码，只在这一层做适配。
 */

import { useCallback } from "react";
import type { CommandRegistry } from "@vivlos/commands/registry.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { SessionManager } from "@vivlos/agent/session/index.ts";
import type { MemoryManager } from "@vivlos/agent/memory/index.ts";
import type { CommandContext, CommandResult } from "@vivlos/commands/types.ts";

export interface UseCommandsOptions {
  registry: CommandRegistry;
  llm: LLMClient;
  eventBus: EventBus;
  sessionManager: SessionManager;
  memoryManager: MemoryManager;
  /** /quit 回调 → process.exit */
  shutdown: () => void;
  /** /clear 额外回调 → 清 React state（消息/日志） */
  onClear: () => void;
  /** /detail 展开状态 */
  detailExpanded: boolean;
  /** /detail toggle */
  onToggleDetail: () => void;
}

export interface CommandHandleResult {
  handled: boolean;
  feedback?: string;
}

/** pi-tui 的 TUI 对象桩——commands 只调 requestRender() 和 status，两个都 no-op */
const tuiStub = {
  requestRender() { /* OpenTUI React 自动重渲染 */ },
  status: { showFeedback(_text: string) { /* 通过 hook 返回值处理 */ } },
} as unknown as CommandContext["tui"];

export function useCommands(opts: UseCommandsOptions) {
  const {
    registry, llm, eventBus, sessionManager, memoryManager,
    shutdown, onClear, detailExpanded, onToggleDetail,
  } = opts;

  const ctx: CommandContext = {
    llm,
    eventBus,
    sessionManager,
    memoryManager,
    registry,
    shutdown,
    tui: tuiStub,
    toggleDetail: onToggleDetail,
    expanded: detailExpanded,
  };

  return useCallback(async (text: string): Promise<CommandHandleResult> => {
    if (!text.startsWith("/")) return { handled: false };

    const parts = text.slice(1).split(/\s+/);
    const name = parts[0];
    const args = parts.slice(1).join(" ");

    const cmd = registry.getSlash(name);
    if (!cmd) return { handled: false };

    try {
      const result: CommandResult = await cmd.execute(ctx, args);

      // /clear 额外清 React state
      if (name === "clear") onClear();

      return { handled: true, feedback: result.feedback };
    } catch (err) {
      return {
        handled: true,
        feedback: `命令执行失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }, [ctx, onClear]);
}
