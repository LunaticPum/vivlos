/**
 * OpenTUI 入口
 *
 * 复用 vivlos 的 Agent/LLM/EventBus 装配逻辑，
 * 渲染层用 OpenTUI 替代 pi-tui。
 */

import "dotenv/config";
import { resolve } from "node:path";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createLLM, loadLLMConfigFromEnv } from "@vivlos/infra/llm/index.ts";
import { createEventBus } from "@vivlos/infra/eventbus/index.ts";
import { createAgent } from "@vivlos/agent/index.ts";
import { createSessionManager } from "@vivlos/agent/session/index.ts";
import { createMemoryManager } from "@vivlos/agent/memory/manager.ts";
import { createBuiltinTools } from "@vivlos/agent/tools/index.ts";
import { App } from "./App";

async function main() {
  // ── 装配 infra ──
  const llmConfig = loadLLMConfigFromEnv();
  const llm = createLLM(llmConfig);
  const eventBus = createEventBus();

  const model = llm.getModel(llmConfig.defaultProvider, llmConfig.defaultModelId);
  const modelLabel = `${llmConfig.defaultProvider || "?"}/${llmConfig.defaultModelId || "?"}`;

  // ── 装配 agent ──
  const dbPath = process.env.VIVLOS_DB_PATH ?? resolve(process.cwd(), "vivlos.db");
  const tools = createBuiltinTools(process.cwd());
  const sessionManager = createSessionManager({ persistent: false });
  const memoryManager = createMemoryManager(dbPath);
  const agent = createAgent({
    llm, eventBus, model, tools, memoryManager, sessionManager,
    maxTurns: 10, thinkingLevel: "medium",
  });

  // ── OpenTUI 渲染器 ──
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(
    <App agent={agent} eventBus={eventBus} modelLabel={modelLabel} />,
  );
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
