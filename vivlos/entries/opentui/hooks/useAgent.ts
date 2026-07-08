/**
 * useAgent hook
 *
 * 桥接 vivlos EventBus → OpenTUI React state。
 * 返回 { logs, finalText, loading, status, submit, spin }，
 * 组件层只消费这些数据，不直接触 EventBus。
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS } from "../ui/animations/loading.ts";

// ── 类型 ──

interface ThinkingEntry {
  kind: "thinking";
  text: string;
  active: boolean;
}

interface ToolEntry {
  kind: "tool";
  name: string;
  callId: string;
  result?: string;
  active: boolean;
}

interface TurnSepEntry {
  kind: "turn_sep";
}

export type LogEntry = ThinkingEntry | ToolEntry | TurnSepEntry;

// ── 工具 ──

/** 提取 tool result 内的可读文本 */
function extractToolText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return String(raw ?? "");
  const r = raw as Record<string, unknown>;
  const details = r.details as Record<string, unknown> | undefined;
  if (details?.message && typeof details.message === "string" && details.message.trim()) {
    return details.message;
  }
  const content = r.content as Array<{ type: string; text?: string }> | undefined;
  if (content) {
    const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    if (text.trim()) return text;
  }
  return String(raw);
}

/** 从 messageSnapshot 提取完整 thinking 文本（优先于 delta 增量片段） */
function extractThinkingFromSnapshot(snapshot: unknown): string | null {
  const msg = snapshot as { content?: Array<{ type: string; thinking?: string }> } | undefined;
  if (!msg?.content) return null;
  const blocks = msg.content.filter((c) => c.type === "thinking" && c.thinking);
  if (blocks.length === 0) return null;
  // 取最后一个 thinking block（pi snapshot 可能包含历史累积）
  return blocks[blocks.length - 1]!.thinking!;
}

// ── hook ──

export function useAgent(agent: VivlosAgent, eventBus: EventBus) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [finalText, setFinalText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  // spinner 动画
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(
      () => setSpinnerFrame((f: number) => (f + 1) % SPINNER_FRAMES.length),
      SPINNER_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [loading]);

  // 当前 spinner 图标
  const spin = SPINNER_FRAMES[spinnerFrame] ?? "?";

  // tracking refs（跨 render 不丢）
  const activeThinkingIdx = useRef(-1);
  const callIdMap = useRef(new Map<string, number>());

  // ── EventBus 订阅 ──

  useEffect(() => {
    const handleThinkingDelta = (e: { delta: string; messageSnapshot?: unknown }) => {
      const text = extractThinkingFromSnapshot(e.messageSnapshot) || e.delta;

      setLogs((prev: LogEntry[]) => {
        const idx = activeThinkingIdx.current;
        if (idx >= 0 && idx < prev.length && prev[idx]?.kind === "thinking") {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], text } as ThinkingEntry;
          return updated;
        }
        const entry: ThinkingEntry = { kind: "thinking", text, active: true };
        const next = [...prev, entry];
        activeThinkingIdx.current = next.length - 1;
        return next;
      });
    };

    const handleToolStart = (e: { toolName: string; callId: string }) => {
      // 标记当前 thinking 为完成
      const thinkIdx = activeThinkingIdx.current;
      activeThinkingIdx.current = -1;
      if (thinkIdx >= 0) {
        setLogs((prev: LogEntry[]) => {
          if (thinkIdx < prev.length && prev[thinkIdx]?.kind === "thinking") {
            const updated = [...prev];
            updated[thinkIdx] = { ...updated[thinkIdx], active: false } as ThinkingEntry;
            return updated;
          }
          return prev;
        });
      }
      const entry: ToolEntry = { kind: "tool", name: e.toolName, callId: e.callId, active: true };
      setLogs((prev: LogEntry[]) => {
        const next = [...prev, entry];
        callIdMap.current.set(e.callId, next.length - 1);
        return next;
      });
    };

    const handleToolEnd = (e: { callId: string; result: unknown; success: boolean }) => {
      const idx = callIdMap.current.get(e.callId);
      if (idx === undefined) return;
      const resultText = extractToolText(e.result);
      setLogs((prev: LogEntry[]) => {
        const updated = [...prev];
        const entry = updated[idx];
        if (entry?.kind === "tool") {
          updated[idx] = { ...entry, result: resultText, active: false };
        }
        return updated;
      });
    };

    const handleTurnComplete = () => {
      // 标记当前 thinking 为完成
      const thinkIdx = activeThinkingIdx.current;
      activeThinkingIdx.current = -1;
      if (thinkIdx >= 0) {
        setLogs((prev: LogEntry[]) => {
          if (thinkIdx < prev.length && prev[thinkIdx]?.kind === "thinking") {
            const updated = [...prev];
            updated[thinkIdx] = { ...updated[thinkIdx], active: false } as ThinkingEntry;
            return updated;
          }
          return prev;
        });
      }
      setLogs((prev: LogEntry[]) => [...prev, { kind: "turn_sep" }]);
    };

    const handleComplete = (e: { finalMessage: string }) => {
      activeThinkingIdx.current = -1;
      setFinalText(e.finalMessage);
      setLoading(false);
      setStatus("");
      setLogs((prev: LogEntry[]) => {
        const last = prev[prev.length - 1];
        if (last?.kind === "turn_sep") return prev.slice(0, -1);
        return prev;
      });
    };

    const handleError = (e: { error: Error }) => {
      setStatus(e.error.message);
      setLoading(false);
    };

    const handleStart = () => {
      setLogs([]);
      setFinalText("");
      setLoading(true);
      setStatus("");
      activeThinkingIdx.current = -1;
      callIdMap.current.clear();
    };

    const handleTurnStart = () => {
      activeThinkingIdx.current = -1;
    };

    // 订阅
    const unsubs = [
      eventBus.on("agent:start", handleStart),
      eventBus.on("agent:turn_start", handleTurnStart),
      eventBus.on("agent:thinking_delta", handleThinkingDelta),
      eventBus.on("agent:toolCall_start", handleToolStart),
      eventBus.on("agent:toolCall_end", handleToolEnd),
      eventBus.on("agent:turn_complete", handleTurnComplete),
      eventBus.on("agent:complete", handleComplete),
      eventBus.on("agent:error", handleError),
    ];

    return () => unsubs.forEach((fn) => fn());
  }, [eventBus]);

  // ── submit ──

  const submit = useCallback(
    async (text: string) => {
      if (loading) return;
      try {
        await agent.prompt(text);
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
        setLoading(false);
      }
    },
    [agent, loading],
  );

  return { logs, finalText, loading, status, submit, spin };
}
