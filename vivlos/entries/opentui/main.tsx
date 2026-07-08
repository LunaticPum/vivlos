/**
 * OpenTUI 入口
 *
 * 装配逻辑完全复刻 vivlos/main.ts，仅 TUI 渲染层改用 OpenTUI。
 */

import "dotenv/config";
import { resolve } from "node:path";
import { homedir } from "node:os";

// —— 基础设施 ——
import { createLLM, loadLLMConfigFromEnv } from "@vivlos/infra/llm/index.ts";
import { createMarkdownLogWriter, initLogger } from "@vivlos/infra/logger/index.ts";
import { closeAll as closeDb } from "@vivlos/infra/storage/index.ts";
import { createEventBus } from "@vivlos/infra/eventbus/index.ts";

// —— 上游业务 ——
import { createAgent } from "@vivlos/agent/index.ts";
import { createSessionManager } from "@vivlos/agent/session/index.ts";
import { createMemoryManager } from "@vivlos/agent/memory/index.ts";
import { createBuiltinTools } from "@vivlos/agent/tools/index.ts";

// —— 命令系统 ——
import { createCommandRegistry, builtinSlashCommands } from "@vivlos/commands/index.ts";

// —— OpenTUI 渲染 ——
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App";

async function main(): Promise<void> {
  // ── 装配 infra ──
  const llmConfig = loadLLMConfigFromEnv();
  const llm = createLLM(llmConfig);
  const eventBus = createEventBus();
  initLogger(eventBus);

  const dbPath = process.env.VIVLOS_DB_PATH ?? resolve(process.cwd(), "vivlos.db");
  const logDir = process.env.VIVLOS_LOG_DIR ?? resolve(homedir(), ".vivlos", "logs");

  // ── 装配 agent ──
  const model = llm.getModel(llmConfig.defaultProvider, llmConfig.defaultModelId);
  if (!model) {
    console.error(`找不到模型: ${llmConfig.defaultProvider}/${llmConfig.defaultModelId}`);
    console.error("请在 .env 里设置 DEEPSEEK_API_KEY 和 VIVLOS_DEFAULT_PROVIDER/MODEL");
    process.exit(1);
  }

  const tools = createBuiltinTools(process.cwd());
  const sessionManager = createSessionManager({ persistent: true, dbPath });
  const memoryManager = createMemoryManager(dbPath);

  const logger = createMarkdownLogWriter(eventBus, { logDir, sessionId: sessionManager.id });
  logger.start();

  const agent = createAgent({
    llm, eventBus, model, maxTurns: 10, tools, memoryManager, sessionManager, thinkingLevel: "medium",
  });

  // ── 命令系统 ──
  const registry = createCommandRegistry();
  for (const cmd of builtinSlashCommands) {
    registry.registerSlash(cmd);
  }

  // ── 退出清理 ──
  const cleanup = () => {
    process.stdout.write("\x1b[2J\x1b[H");
    logger.stop();
    closeDb();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // ── 装配 TUI（OpenTUI） ──
  const modelLabel = `${llmConfig.defaultProvider}/${llmConfig.defaultModelId}`;
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(
    <App
      agent={agent}
      eventBus={eventBus}
      modelLabel={modelLabel}
      llm={llm}
      sessionManager={sessionManager}
      memoryManager={memoryManager}
      registry={registry}
      shutdown={cleanup}
    />,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
