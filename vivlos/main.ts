import "dotenv/config";
import { resolve } from "node:path";
import { createLLM, loadLLMConfigFromEnv } from "@vivlos/infra/llm/index.ts";
import { createEventBus } from "@vivlos/infra/eventbus/index.ts";
import { createAgent } from "@vivlos/agent/index.ts";
import { createSqliteSession, closeAll as closeDb } from "@vivlos/infra/storage/index.ts";
import {
	createSQLiteMemoryBackend,
	createMemoryManager,
} from "@vivlos/agent/memory/index.ts";
import { createBuiltinTools } from "@vivlos/agent/tools/index.ts";
import { createTuiApp } from "@vivlos/entries/tui/index.ts";

async function main(): Promise<void> {
	// ── 装配 infra ──
	const llmConfig = loadLLMConfigFromEnv();
	const llm = createLLM(llmConfig);
	const eventBus = createEventBus();

	// P6 数据库路径（默认项目根目录下的 vivlos.db）
	const dbPath =
		process.env.VIVLOS_DB_PATH ?? resolve(process.cwd(), "vivlos.db");

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

	// P6: session 持久化——替换内存 session
	const session = createSqliteSession(dbPath);

	// P6: 初始化 MemoryManager
	const memoryBackend = createSQLiteMemoryBackend(dbPath);
	const memoryManager = createMemoryManager(memoryBackend);

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
	process.on("SIGINT", () => { closeDb(); process.exit(0); });
	process.on("SIGTERM", () => { closeDb(); process.exit(0); });

	// ── 装配 TUI ──
	const tuiApp = createTuiApp({ agent, eventBus });
	tuiApp.start();
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
