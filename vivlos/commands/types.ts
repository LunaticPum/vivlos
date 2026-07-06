import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { SessionManager } from "@vivlos/agent/session/index.ts";
import type { MemoryManager } from "@vivlos/agent/memory/index.ts";
import type { TUI } from "@earendil-works/pi-tui";

/**
 * 命令执行上下文——所有命令可能用到的依赖。
 *
 * commands 层夹在 agent 和 entries 之间，调用 agent 层接口，
 * 不直接操作 infra 层数据结构。
 */
import type { CommandRegistry } from "./registry.ts";

export interface CommandContext {
	readonly llm: LLMClient;
	readonly eventBus: EventBus;
	readonly sessionManager: SessionManager;
	readonly memoryManager: MemoryManager;
	readonly tui: TUI;
	/** 命令注册表——/help 用它列出所有命令 */
	readonly registry: CommandRegistry;
}

/**
 * TUI Slash 命令（如 /help）。
 *
 * 用户输入 /xxx 时匹配执行。consumed=true 表示已被命令消费，
 * 不再传给 LLM。
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

/** Slash 命令执行结果 */
export interface CommandResult {
	/** true = 不传给 LLM，false = 作为普通消息发送 */
	consumed: boolean;
	/** TUI 反馈消息（可选，consumed=true 时用到） */
	feedback?: string;
}