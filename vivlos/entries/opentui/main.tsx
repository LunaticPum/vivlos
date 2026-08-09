/**
 * OpenTUI 入口
 *
 * 装配逻辑复刻 vivlos/main.ts，TUI 渲染层改用 OpenTUI。
 * SQLite 持久化：LLMConfig、API Key 凭证、自定义 provider 配置。
 */

import "dotenv/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// -- 基础设施 --
import { createLLM, loadLLMConfigFromEnv } from "@vivlos/infra/llm/index.ts";
import { initLogger } from "@vivlos/infra/logger/index.ts";
import { closeAll as closeDb } from "@vivlos/infra/storage/index.ts";
import {
	createSqliteConfigRepository,
	createLLMConfigRepository,
	createSqliteCredentialStore,
} from "@vivlos/infra/storage/index.ts";
import { createEventBus } from "@vivlos/infra/eventbus/index.ts";
import {
	ensureVivlosDir,
	getDbPath,
	ensureTempDir,
	cleanTempDir,
	ensureConfigDir,
	ensureSessionsDir,
} from "@vivlos/infra/paths.ts";
import { ensureConfig, loadConfig } from "@vivlos/infra/config/index.ts";
import { checkPiAiVersion } from "@vivlos/infra/version.ts";
import { createMemoryEventLogger } from "@vivlos/agent/memory/utils/event-logger.ts";
import {
	createMemoryRuntime,
	createMemoryCoordinator,
} from "@vivlos/agent/memory/index.ts";
import { createL2Indexer } from "@vivlos/agent/memory/layers/l2/indexer.ts";
import { createL2SearchService } from "@vivlos/agent/memory/layers/l2/search.ts";
import { getL2Db, readL2Overview } from "@vivlos/infra/storage/memory/index.ts";

// -- 上游业务 --
import { createAgent, createPromptBuilder } from "@vivlos/agent/index.ts";
import { createSessionManager } from "@vivlos/agent/session/index.ts";
import {
	createBuiltinTools,
	createAdvancedTools,
} from "@vivlos/agent/tools/index.ts";
import { readTodoList } from "@vivlos/agent/tools/advanced/todo/storage.ts";
import {
	scanSkillsDir,
	formatSkillsForPrompt,
} from "@vivlos/agent/skills/index.ts";

// -- OpenTUI 渲染 --
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App";

async function main(): Promise<void> {
	// ── 装配 infra ──
	const eventBus = createEventBus();
	initLogger(eventBus);

	ensureVivlosDir();
	cleanTempDir();
	ensureTempDir();
	ensureConfigDir();
	ensureConfig();
	const config = loadConfig();
	ensureSessionsDir();
	const dbPath = process.env.VIVLOS_DB_PATH ?? getDbPath();

	// ── SQLite 持久化层 ──
	const configRepo = createSqliteConfigRepository(dbPath);
	const llmConfigRepo = createLLMConfigRepository(configRepo);
	const credentialStore = createSqliteCredentialStore(configRepo);

	// LLM 配置：SQLite 优先，env 兜底
	const envConfig = loadLLMConfigFromEnv();
	const llmConfig = llmConfigRepo.loadConfig() ?? envConfig;
	if (!llmConfigRepo.loadConfig()) {
		llmConfigRepo.saveConfig(llmConfig); // 首次启动写入 SQLite
	}

	const llm = createLLM(llmConfig, credentialStore);

	// 恢复自定义 provider + 凭证（每个 model config 单独恢复，addCustomProvider 自动合并同域名）
	for (const id of llmConfigRepo.listCustomProviders()) {
		const config = llmConfigRepo.loadCustomProvider(id);
		if (config) {
			llm.addCustomProvider(config);
			const domain = id.split("/")[0];
			await llm.setCredential(domain, config.apiKey);
		}
	}

	// 确保默认 provider/model 出现在 Recent 列表中
	llmConfigRepo.addRecentProvider(llmConfig.defaultProvider);
	llmConfigRepo.addRecentModel(
		`${llmConfig.defaultProvider}/${llmConfig.defaultModelId}`,
	);

	// ── 装配 agent ──
	const model = llm.getModel(
		llmConfig.defaultProvider,
		llmConfig.defaultModelId,
	);
	if (!model) {
		console.error(
			`找不到模型: ${llmConfig.defaultProvider}/${llmConfig.defaultModelId}`,
		);
		console.error("请在 .env 里设置 API_KEY 和 VIVLOS_DEFAULT_PROVIDER/MODEL");
		process.exit(1);
	}

	// ── 扫描 skills（builtin + extension）──
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const skillsDir = resolve(__dirname, "../../agent/skills");
	const skillRegistry = scanSkillsDir(resolve(skillsDir, "builtin"), "builtin");
	scanSkillsDir(resolve(skillsDir, "extension"), "extension", skillRegistry);

	const { tools: builtinTools, reset: toolsReset } = createBuiltinTools(
		process.cwd(),
		skillRegistry,
	);
	const sessionManager = createSessionManager();
	const memoryRuntime = createMemoryRuntime({
		eventBus,
		llm,
		sessionManager,
		limits: config.memory.characterLimit,
		config: config.memory.consolidator,
	});
	const memoryCoordinator = createMemoryCoordinator();

	// ── L2 会话检索（索引 + session_search）──
	const l2Enabled = config.memory.l2.enabled;
	const l2Indexer = l2Enabled ? createL2Indexer() : null;
	const l2SearchService = l2Enabled ? createL2SearchService() : null;
	const publishL2Overview = () => {
		if (!l2Enabled) return;
		eventBus.emit({
			type: "memory:l2_overview",
			overview: readL2Overview(getL2Db()),
		});
	};
	if (l2Indexer) {
		memoryCoordinator.onAfterTurn((context) => {
			l2Indexer.upsertSession(context.sessionId);
			publishL2Overview();
		});
		memoryCoordinator.onSessionDelete((sessionId) => {
			l2Indexer.removeSession(sessionId);
			publishL2Overview();
		});
		eventBus.on("memory:overview_requested", () => publishL2Overview());
		l2Indexer.backfill(config.memory.l2.backfillSessionLimit);
		publishL2Overview();
	}
	const disposeMemoryLogger = createMemoryEventLogger(
		eventBus,
		(sessionId) => sessionManager.resolveDir(sessionId) ?? sessionManager.dirPath,
	);
	const promptBuilder = createPromptBuilder();
	eventBus.on("memory:changed", (event) => {
		if (event.sessionId === sessionManager.id) promptBuilder.invalidate();
	});

	// ── 装配 advanced tools（todo / delegate / offer_choice / memory）──
	const advancedTools = createAdvancedTools({
		eventBus,
		getSessionId: () => sessionManager.id,
		getSessionDir: () => sessionManager.dirPath,
		getMemoryService: () => memoryRuntime.getService(),
		getMemoryOperationContext: (command, reasonCode, reason) =>
			memoryRuntime.getOperationContext(command, reasonCode, reason),
		onMemoryResult: (command, result) =>
			memoryRuntime.recordMainResult(command, result),
		getL2SearchService: l2SearchService ? () => l2SearchService : undefined,
		llm,
		getModel: () => model,
		thinkingLevel: "medium",
		getDelegationTools: () => builtinTools,
	});
	const tools = [...builtinTools, ...advancedTools];

	const skillsText = formatSkillsForPrompt(skillRegistry.list());
	if (skillsText) {
		promptBuilder.setSkills(skillsText);
	}

	const agent = createAgent({
		llm,
		eventBus,
		model,
		maxTurns: 10,
		tools,
		toolsReset,
		readTodoList: () => readTodoList(sessionManager.dirPath),
		memoryRuntime,
		memoryCoordinator,
		sessionManager,
		promptBuilder,
		thinkingLevel: "medium",
	});

	// ── 退出清理 ──
	const cleanup = () => {
		process.stdout.write("\x1b[2J\x1b[H");
		disposeMemoryLogger();
		closeDb();
		process.exit(0);
	};
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);

	// ── 装配 OpenTUI ──
	const modelLabel = `${llmConfig.defaultProvider}/${llmConfig.defaultModelId}`;
	const piAiVersion = await checkPiAiVersion();
	const renderer = await createCliRenderer({ exitOnCtrlC: false });
	createRoot(renderer).render(
		<App
			modelLabel={modelLabel}
			agent={agent}
			eventBus={eventBus}
			llm={llm}
			llmConfigRepo={llmConfigRepo}
			piAiVersion={piAiVersion}
			onExit={cleanup}
		/>,
	);
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
