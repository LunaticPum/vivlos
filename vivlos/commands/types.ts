import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { SessionManager } from "@vivlos/agent/session/index.ts";
import type { MemoryManager } from "@vivlos/agent/memory/index.ts";
import type { TUI } from "@earendil-works/pi-tui";
import type { CommandRegistry } from "./registry.ts";

/**
 * 命令执行上下文——所有命令的依赖集合。
 *
 * commands 层夹在 agent 和 entries 之间，
 * 调用 agent 层接口，不直接操作 infra 层数据结构。
 */
export interface CommandContext {
	readonly llm: LLMClient;
	readonly eventBus: EventBus;
	readonly sessionManager: SessionManager;
	readonly memoryManager: MemoryManager;
	readonly tui: TUI;
	/** 命令注册表——/help 用它列出所有命令 */
	readonly registry: CommandRegistry;
	/** 优雅退出——/quit 调用此方法而非 process.exit */
	readonly shutdown: () => void;
}

/**
 * TUI Slash 命令（如 /help）。
 *
 * 用户输入 /xxx 时匹配执行。TUI 层拦截到 / 开头的输入后查 registry，
 * 找到则调 execute()，找不到则作为普通消息传 LLM。
 */
export interface SlashCommand {
	readonly name: string;
	readonly description: string;
	readonly usage?: string;
	execute(ctx: CommandContext, args: string): Promise<CommandResult>;
}

/**
 * CLI 启动命令（如 --model）。
 *
 * main() 启动时解析 process.argv，匹配执行。
 */
export interface StartupCommand {
	readonly flag: string;
	readonly shortFlag?: string;
	readonly description: string;
	readonly takesValue: boolean;
	execute(ctx: CommandContext, value: string | true): Promise<void>;
}

/** 命令执行结果 */
export interface CommandResult {
	/** TUI 反馈消息（可选） */
	feedback?: string;
}