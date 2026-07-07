import { TUI, ProcessTerminal, Spacer } from "@earendil-works/pi-tui";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { VivlosAgent } from "@vivlos/agent/types.ts";
import {
	createChatContainer,
	createInputContainer,
	createStatusContainer,
} from "./containers/index.ts";
import type { CommandContext } from "@vivlos/commands/types.ts";
import { InputDecorator } from "./components/input-decorator.ts";

export interface CreateTuiAppParams {
	readonly agent: VivlosAgent;
	readonly eventBus: EventBus;
	readonly cmdCtx: Omit<CommandContext, "tui">;
}

/** 提取 tool result 内的可读文本 */
function extractToolText(raw: unknown): string {
	if (typeof raw === "string") {
		try {
			const p = JSON.parse(raw);
			return p?.content?.[0]?.text ?? p?.details?.message ?? raw;
		} catch { return raw; }
	}
	const obj = raw as Record<string, unknown>;
	const content = obj?.content as Array<{ text?: string }> | undefined;
	if (content?.[0]?.text) return content[0].text;
	return (obj?.details as { message?: string })?.message ?? String(raw);
}

export function createTuiApp(params: CreateTuiAppParams) {
	const { agent, eventBus, cmdCtx } = params;

	const terminal = new ProcessTerminal();
	const tui = new TUI(terminal);

	let detailExpanded = false;
	const cmdCtxWithTui: CommandContext = {
		...cmdCtx,
		tui,
		toggleDetail: () => { detailExpanded = !detailExpanded; chat.toggleDetail(); },
		get expanded() { return detailExpanded; },
	};

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

	let currentTurn = 0;
	let thinkingBuffer = "";

/** 提取 tool result 的可读文本（参照 pi getTextOutput） */
function extractToolText(raw: unknown): string {
	if (!raw || typeof raw !== "object") return String(raw ?? "");
	const r = raw as Record<string, unknown>;
	const content = r.content as Array<{ type: string; text?: string }> | undefined;
	if (content) {
		return content.filter(c => c.type === "text").map(c => c.text ?? "").join("\n");
	}
	return String(raw);
}

	eventBus.on("agent:start", () => {
		currentTurn = 0;
		thinkingBuffer = "";
		chat.clearTurn();
		status.showLoading();
		tui.requestRender();
	});

	eventBus.on("agent:turn_start", (e) => {
		currentTurn = e.turn;
		// thinkingBuffer 不清——cross-turn 累积
		chat.startTurn(e.turn);
		status.clear();
		tui.requestRender();
	});

	// thinking_end → 完整内容（DeepSeek），不累积
	eventBus.on("agent:thinking_delta", (e) => {
		thinkingBuffer += e.delta;
		chat.setThinking(thinkingBuffer);
		tui.requestRender();
	});

	eventBus.on("agent:message_delta", (_e) => {
		tui.requestRender();
	});

	eventBus.on("agent:message_complete", () => {
		tui.requestRender();
	});

	eventBus.on("agent:complete", (e) => {
		chat.finalizeTurn(e.finalMessage);
		status.clear();
		inputContainer.enable();
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_start", (e) => {
		chat.addTool(e.toolName);
		status.showToolRunning(e.toolName);
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_delta", (e) => {
		chat.updateToolResult(extractToolText(e.partialResult));
		tui.requestRender();
	});

	eventBus.on("agent:toolCall_end", (e) => {
		chat.updateToolResult(extractToolText(e.result));
		chat.endTool();
		status.showToolDone(e.success);
		tui.requestRender();
	});

	eventBus.on("agent:turn_complete", () => {});
	eventBus.on("agent:error", (e) => {
		chat.clearTurn();
		status.showError(e.error.message);
		inputContainer.enable();
		tui.requestRender();
	});

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
			status.showError(`fatal: ${err instanceof Error ? err.message : String(err)}`);
			inputContainer.enable();
			tui.requestRender();
		}
	};

	inputContainer.onEscape = () => {
		tui.stop();
		cmdCtxWithTui.shutdown();
	};

	return { start() { tui.start(); }, stop() { tui.stop(); } };
}