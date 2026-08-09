import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import type {
	MemoryOperationContext,
	MemoryService,
	MemoryServiceResult,
	MainMemoryCommand,
} from "@vivlos/agent/memory/index.ts";
import type { L2SearchService } from "@vivlos/agent/memory/layers/l2/search.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/index.ts";
import { createTodoTools } from "./todo/todo.ts";
import { createDelegateTool } from "./delegate/delegate.ts";
import { createOfferChoiceTool } from "./offer-choice/offer-choice.ts";
import { createMemoryTool } from "./memory/memory.ts";
import { createSessionSearchTool } from "./session-search/session-search.ts";

/**
 * Advanced tools 的运行时依赖。
 *
 * 由组合根（main.tsx / agent/index.ts）注入，
 * 每个具体 tool 按需取用自己需要的字段。
 */
export interface AdvancedToolDeps {
	/** EventBus -- todo/offer_choice 发事件用 */
	readonly eventBus: EventBus;
	/** 当前 session ID（session 切换后值变化） */
	readonly getSessionId: () => string;
	/** 当前 session 目录路径（session 切换后值变化） */
	readonly getSessionDir: () => string;
	/** 主模型 Memory 命令的统一业务入口 */
	readonly getMemoryService?: () => MemoryService;
	/** 仅保留给未迁移的调用方；新组合根应使用 getMemoryService。 */
	readonly memoryService?: MemoryService;
	readonly getMemoryOperationContext?: (
		command: MainMemoryCommand,
		reasonCode: string,
		reason?: string,
	) => MemoryOperationContext;
	readonly onMemoryResult?: (
		command: MainMemoryCommand,
		result: MemoryServiceResult,
	) => void;
	/** L2 会话检索服务；提供时注册 session_search Tool */
	readonly getL2SearchService?: () => L2SearchService;
	/** L2 默认返回条数 */
	readonly l2MaxResults?: number;
	/** 委派：子 agent 使用的 LLM 客户端 */
	readonly llm?: LLMClient;
	/** 委派：子 agent 使用的模型（继承主模型） */
	readonly getModel?: () => Model<Api>;
	/** 委派：子 agent 的思考强度（继承主会话） */
	readonly thinkingLevel?: ThinkingLevel;
	/** 委派：子 agent 可选工具池（通常为 builtin tools），按类别过滤 */
	readonly getDelegationTools?: () => readonly AgentTool<any, any>[];
}

/**
 * 创建全部 advanced tools。
 *
 * 返回 AgentTool 数组，由组合根合并到 builtin tools 一起传给 createAgentLoop。
 * 各 tool 的具体实现在各自子目录（todo/ delegate/ offer-choice/ memory/）。
 */
export function createAdvancedTools(deps: AdvancedToolDeps): AgentTool<any, any>[] {
	const tools: AgentTool<any, any>[] = [
		...createTodoTools(deps),
		createOfferChoiceTool(deps),
		createMemoryTool({
			getMemoryService: () => {
				const service = deps.getMemoryService?.() ?? deps.memoryService;
				if (!service) throw new Error("Memory Service 未配置");
				return service;
			},
			getMemoryOperationContext: (command, reasonCode, reason) =>
				deps.getMemoryOperationContext?.(command, reasonCode, reason) ?? {
					sessionId: deps.getSessionId(),
					reasonCode,
					...(reason ? { reason } : {}),
				},
			onCapacityExceeded: deps.onMemoryResult,
		}),
	];
	if (deps.getL2SearchService) {
		tools.push(
			createSessionSearchTool({ getSearchService: deps.getL2SearchService }),
		);
	}
	if (deps.llm && deps.getModel && deps.getDelegationTools) {
		tools.push(
			createDelegateTool({
				llm: deps.llm,
				getModel: deps.getModel,
				thinkingLevel: deps.thinkingLevel,
				getAvailableTools: deps.getDelegationTools,
				eventBus: deps.eventBus,
				getSessionId: deps.getSessionId,
			}),
		);
	}
	return tools;
}
