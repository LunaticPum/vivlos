import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import { createTodoTool } from "./todo/todo.ts";
import { createTaskTool } from "./task/task.ts";
import { createOfferChoiceTool } from "./offer-choice/offer-choice.ts";
import { createMemoryTool } from "./memory/memory.ts";

/**
 * Advanced tools 的运行时依赖。
 *
 * 由组合根（main.tsx / agent/index.ts）注入，
 * 每个具体 tool 按需取用自己需要的字段。
 */
export interface AdvancedToolDeps {
	/** EventBus -- todo/task/offer_choice 发事件用 */
	readonly eventBus: EventBus;
	/** 当前 session ID（session 切换后值变化） */
	readonly getSessionId: () => string;
	/** 当前 session 目录路径（session 切换后值变化） */
	readonly getSessionDir: () => string;
	/** tasks 目录路径（~/.vivlos/tasks） */
	readonly tasksDir: string;
	/** memories 目录路径（~/.vivlos/memories） */
	readonly memoriesDir: string;
	/** memory 字符上限配置 */
	readonly memoryConfig: {
		readonly memoryCap: number;
		readonly userCap: number;
	};
}

/**
 * 创建全部 advanced tools。
 *
 * 返回 AgentTool 数组，由组合根合并到 builtin tools 一起传给 createAgentLoop。
 * 各 tool 的具体实现在各自子目录（todo/ task/ offer-choice/ memory/）。
 */
export function createAdvancedTools(deps: AdvancedToolDeps): AgentTool<any, any>[] {
	return [
		createTodoTool(deps),
		createTaskTool(deps),
		createOfferChoiceTool(deps),
		createMemoryTool(deps),
	].filter(Boolean);
}
