/**
 * useAgent hook
 *
 * 桥接 vivlos EventBus → OpenTUI React state。
 * 返回 { logs, finalText, loading, status, submit }，
 * 组件层只消费这些数据，不直接触 EventBus。
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";

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

const BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

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
    const id = setInterval(() => setSpinnerFrame((f: number) => (f + 1) % BRAILLE.length), 400);
    return () => clearInterval(id);
  }, [loading]);

  // 当前 spinner 图标
  const spin = BRAILLE[spinnerFrame] ?? "?";

  // tracking refs（跨 render 不丢）
  const activeThinkingIdx = useRef(-1);
  const callIdMap = useRef(new Map<string, number>());
  const logsRef = useRef(logs);
  logsRef.current = logs;

  // ── EventBus 订阅 ──

  useEffect(() => {
    const handleThinkingDelta = (e: { delta: string; messageSnapshot?: unknown }) => {
      setLogs((prev: LogEntry[]) => {
        const idx = activeThinkingIdx.current;
        if (idx >= 0 && idx < prev.length && prev[idx]?.kind === "thinking") {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], text: e.delta } as ThinkingEntry;
          return updated;
        }
        // 新的 thinking 条目
        const entry: ThinkingEntry = { kind: "thinking", text: e.delta, active: true };
        const next = [...prev, entry];
        activeThinkingIdx.current = next.length - 1;
        return next;
      });
    };

    const handleToolStart = (e: { toolName: string; callId: string }) => {
      activeThinkingIdx.current = -1;
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
      activeThinkingIdx.current = -1;
      setLogs((prev: LogEntry[]) => [...prev, { kind: "turn_sep" }]);
    };

    const handleComplete = (e: { finalMessage: string }) => {
      activeThinkingIdx.current = -1;
      setFinalText(e.finalMessage);
      setLoading(false);
      setStatus("");
      // 末尾 turn_sep 不需要，移除
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
