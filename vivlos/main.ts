import "dotenv/config";
import { createLLM, loadLLMConfigFromEnv } from "@vivlos/infra/llm/index.ts";
import { createEventBus } from "@vivlos/infra/eventbus/index.ts";
import { createAgent } from "@vivlos/agent/index.ts";
import { createTuiApp } from "@vivlos/entries/tui/index.ts";

async function main(): Promise<void> {
	// ── 装配 infra ──
	const llmConfig = loadLLMConfigFromEnv();
	const llm = createLLM(llmConfig);
	const eventBus = createEventBus();

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
			"请在 .env 里设置 OPENAI_API_KEY 和 VIVLOS_DEFAULT_PROVIDER/MODEL",
		);
		process.exit(1);
	}

	const agent = createAgent({
		llm,
		eventBus,
		model,
		maxTurns: 10,
	});

	// ── 装配 TUI ──
	const tuiApp = createTuiApp({ agent, eventBus });
	tuiApp.start();
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
