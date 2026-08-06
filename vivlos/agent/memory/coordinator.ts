/**
 * MemoryCoordinator（S0 公共约束）。
 *
 * 四层记忆的唯一生命周期分发点。各层只注册钩子，不自行监听散落事件。
 * Coordinator 不实现任何层的业务规则，只做钩子分发和失败隔离：
 * 某层钩子失败不影响主对话流程，也不影响后续层的执行。
 *
 * 钩子时机：
 * - beforeTurn    每个 User Turn 开始前，仅一次
 * - afterTurn     canonical 消息落盘后，仅一次
 * - sessionDelete Session 被删除
 *
 * beforeStep（每个 ReAct step）仍由 agent-loop 直接调用 L1 Runtime.prepare，
 * 不经过 Coordinator，保持现有行为不变。
 */

import { log } from "@vivlos/infra/logger/index.ts";

// #region 钩子上下文

/** beforeTurn 钩子上下文。 */
export interface BeforeTurnContext {
	readonly sessionId: string;
	/** 本轮用户输入文本（用于 L3 prefetch 等）。 */
	readonly userText: string;
}

/** afterTurn 钩子上下文。 */
export interface AfterTurnContext {
	readonly sessionId: string;
}

// #endregion

// #region 钩子处理器

export type BeforeTurnHandler = (
	context: BeforeTurnContext,
) => void | Promise<void>;

export type AfterTurnHandler = (
	context: AfterTurnContext,
) => void | Promise<void>;

export type SessionDeleteHandler = (sessionId: string) => void | Promise<void>;

// #endregion

// #region Coordinator 契约

export interface MemoryCoordinator {
	onBeforeTurn(handler: BeforeTurnHandler): void;
	onAfterTurn(handler: AfterTurnHandler): void;
	onSessionDelete(handler: SessionDeleteHandler): void;

	beforeTurn(context: BeforeTurnContext): Promise<void>;
	afterTurn(context: AfterTurnContext): Promise<void>;
	sessionDelete(sessionId: string): Promise<void>;
}

// #endregion

// #region 工厂

/** 创建一个无注册层的空 Coordinator；各层在组合根按需注册钩子。 */
export function createMemoryCoordinator(): MemoryCoordinator {
	const beforeTurnHandlers: BeforeTurnHandler[] = [];
	const afterTurnHandlers: AfterTurnHandler[] = [];
	const sessionDeleteHandlers: SessionDeleteHandler[] = [];

	const runHandlers = async <T>(
		hookName: string,
		handlers: readonly ((arg: T) => void | Promise<void>)[],
		arg: T,
	): Promise<void> => {
		for (const handler of handlers) {
			try {
				await handler(arg);
			} catch (error) {
				const cause = error instanceof Error
					? error
					: new Error(String(error));
				log("warn", `Memory ${hookName} 钩子失败: ${cause.message}`, cause);
			}
		}
	};

	return {
		onBeforeTurn(handler) {
			beforeTurnHandlers.push(handler);
		},
		onAfterTurn(handler) {
			afterTurnHandlers.push(handler);
		},
		onSessionDelete(handler) {
			sessionDeleteHandlers.push(handler);
		},

		beforeTurn(context) {
			return runHandlers("beforeTurn", beforeTurnHandlers, context);
		},
		afterTurn(context) {
			return runHandlers("afterTurn", afterTurnHandlers, context);
		},
		sessionDelete(sessionId) {
			return runHandlers("sessionDelete", sessionDeleteHandlers, sessionId);
		},
	};
}

// #endregion
