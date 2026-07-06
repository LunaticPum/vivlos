import "dotenv/config";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { createLLM, loadLLMConfigFromEnv } from "@vivlos/infra/llm/index.ts";
import { createEventBus } from "@vivlos/infra/eventbus/index.ts";
import { createAgent, createSession } from "@vivlos/agent/index.ts";
import {
	closeAll as closeDb,
	createSqliteMemoryRepository,
} from "@vivlos/infra/storage/index.ts";
import { createMemoryManager } from "@vivlos/agent/memory/index.ts";
import { createBuiltinTools } from "@vivlos/agent/tools/index.ts";
import { createTuiApp } from "@vivlos/entries/tui/index.ts";
import { createMarkdownLogWriter } from "@vivlos/infra/logging/index.ts";

async function main(): Promise<void> {
	// ── 装配 infra ──
	const llmConfig = loadLLMConfigFromEnv();
	const llm = createLLM(llmConfig);
	const eventBus = createEventBus();

	// 数据库路径（默认项目根目录下的 vivlos.db）
	const dbPath =
		process.env.VIVLOS_DB_PATH ?? resolve(process.cwd(), "vivlos.db");

	// 日志目录（默认 ~/.vivlos/logs）
	const logDir =
		process.env.VIVLOS_LOG_DIR ?? resolve(homedir(), ".vivlos", "logs");

	// ── 装配 agent ──
	const model = llm.getModel(
		llmConfig.defaultProvider,
		llmConfig.defaultModelId,
	);
	if (!model) {
		console.error(
			`找不到模型: ${llmConfig.defaultProvider}/${llmConfig.defaultModelId}`,
		);
		console.error(
			"请在 .env 里设置 DEEPSEEK_API_KEY 和 VIVLOS_DEFAULT_PROVIDER/MODEL",
		);
		process.exit(1);
	}

	const tools = createBuiltinTools(process.cwd());

	// session 持久化——通过 createSession 统一入口创建
	const session = createSession({ persistent: true, dbPath });

	// 日志写入器——订阅 eventbus "log" 通道，写入 ~/.vivlos/logs/session-xxx.md
	const logger = createMarkdownLogWriter(eventBus, {
		logDir,
		sessionId: session.id,
	});
	logger.start();

	// MemoryManager——委托 SQLite MemoryRepository
	const memoryRepo = createSqliteMemoryRepository(dbPath);
	const memoryManager = createMemoryManager(memoryRepo);

	const agent = createAgent({
		llm,
		eventBus,
		model,
		maxTurns: 10,
		tools,
		memoryManager,
		session,
	});

	// ── 退出清理 ──
	const cleanup = () => { logger.stop(); closeDb(); process.exit(0); };
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);

	// ── 装配 TUI ──
	const tuiApp = createTuiApp({ agent, eventBus });
	tuiApp.start();
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});