import { TUI, ProcessTerminal, Spacer } from "@earendil-works/pi-tui";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import {
	createChatContainer,
	createInputContainer,
	createStatusContainer,
} from "./containers/index.ts";
import type { CommandContext } from "@vivlos/commands/types.ts";
import type { CommandRegistry } from "@vivlos/commands/index.ts";
import { InputDecorator } from "./components/input-decorator.ts";

export interface CreateTuiAppParams {
	readonly agent: VivlosAgent;
	readonly eventBus: EventBus;
	readonly cmdCtx: Omit<CommandContext, "tui">;
}

export function createTuiApp(params: CreateTuiAppParams) {
	const { agent, eventBus, cmdCtx } = params;

	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal);

	const cmdCtxWithTui: CommandContext = { ...cmdCtx, tui };

	const chat = createChatContainer(tui);
	const status = createStatusContainer(tui);
	const inputContainer = createInputContainer();

	const modelLabel = `${cmdCtx.llm.getDefaultProvider()}/${cmdCtx.llm.getDefaultModelId()}`;
	const inputTopDecorator = new InputDecorator("top", modelLabel);
	const inputBottomDecorator = new InputDecorator("bottom");

	tui.addChild(chat.container);
	tui.addChild(status.container);
	tui.addChild(new Spacer(1));
	tui.addChild(inputTopDecorator);
	tui.addChild(inputContainer.input);
	tui.addChild(inputBottomDecorator);
	tui.setFocus(inputContainer.input);

	// ── 状态追踪 ──
	let currentTurn = 0;
	let thinkingBuffer = "";
	let textBuffer = "";

	// ── EventBus → UI ──

	eventBus.on("agent:start", () => {
		currentTurn = 0;
		thinkingBuffer = "";
		textBuffer = "";
		chat.clearTurn();
		status.showLoading();
		tui.requestRender();
	});

	eventBus.on("agent:turn_start", (e) => {
		currentTurn = e.turn;
		thinkingBuffer = "";
		textBuffer = "";
		chat.startTurn(e.turn);
		status.clear();
		tui.requestRender();
	});

	// thinking_delta → 填充 thinking context
	eventBus.on("agent:thinking_delta", (e) => {
		thinkingBuffer += e.delta;
		chat.setThinking(thinkingBuffer);
		tui.requestRender();
	});

	// message_delta (text_delta) → LLM 正文，不覆盖 thinking
	eventBus.on("agent:message_delta", (e) => {
		textBuffer += e.delta;
		tui.requestRender();
	});

	eventBus.on("agent:message_complete", (e) => {
		chat.finalizeTurn(e.content);
		status.clear();
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_start", (e) => {
		chat.addTool(e.toolName);
		status.showToolRunning(e.toolName);
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_delta", (e) => {
		chat.updateToolResult(e.partialResult);
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_end", (e) => {
		chat.endTool();
		status.showToolDone(e.success);
		tui.requestRender();
	});

	eventBus.on("agent:turn_complete", () => {});

	eventBus.on("agent:complete", () => {
		status.clear();
		chat.clearTurn();
		inputContainer.enable();
		tui.requestRender();
	});

	eventBus.on("agent:error", (e) => {
		chat.clearTurn();
		status.showError(e.error.message);
		inputContainer.enable();
		tui.requestRender();
	});

	// ── 输入提交 ──
	inputContainer.onSubmit = async (value: string) => {
		if (!value.trim()) return;

		if (value.startsWith("/")) {
			const [name, ...rest] = value.slice(1).split(" ");
			const args = rest.join(" ");
			const cmd = cmdCtxWithTui.registry.getSlash(name);
			if (cmd) {
				const result = await cmd.execute(cmdCtxWithTui, args);
				if (result.feedback) {
					status.showHint(result.feedback);
				}
				inputContainer.enable();
				inputContainer.clear();
				tui.requestRender();
				return;
			}
		}

		inputContainer.disable();
		inputContainer.clear();
		chat.appendUserMessage(value);
		tui.requestRender();

		try {
			await agent.prompt(value);
		} catch (err) {
			status.showError(
				`fatal: ${err instanceof Error ? err.message : String(err)}`,
			);
			inputContainer.enable();
			tui.requestRender();
		}
	};

	inputContainer.onEscape = () => {
		tui.stop();
		cmdCtxWithTui.shutdown();
	};

	return {
		start() { tui.start(); },
		stop() { tui.stop(); },
	};
}