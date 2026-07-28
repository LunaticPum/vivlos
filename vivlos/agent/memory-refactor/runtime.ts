/**
 * 当前 session 的 Memory 运行时。
 *
 * 运行时只负责把已有 Memory 组件接起来；它不自动重放失败命令，也不启动后台任务。
 */

import type { Model, Api, Context } from "@earendil-works/pi-ai";
import type { SessionManager } from "@vivlos/agent/session/index.ts";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import type { LLMClient } from "@vivlos/infra/llm/types.ts";
import type { ConsolidatorConfig } from "@vivlos/infra/config/index.ts";
import {
	createMemoryRepository,
	type MemoryLimits,
	type MemoryRepository,
} from "@vivlos/infra/storage/memory/index.ts";
import { createHistory, type History } from "@vivlos/infra/storage/memory/history.ts";
import { resolveModel } from "@vivlos/infra/llm/provider.ts";
import { createMemoryService, type MemoryService, type MemoryServiceResult } from "./service.ts";
import { createRunner, type Runner } from "./consolidator/runner.ts";
import { checkTrigger } from "./consolidator/trigger.ts";
import { createL1 } from "./layers/l1.ts";
import type { MainMemoryCommand } from "./memory.ts";

export interface MemoryRuntimeDeps {
	readonly eventBus: EventBus;
	readonly llm: LLMClient;
	readonly sessionManager: SessionManager;
	readonly limits: MemoryLimits;
	readonly config: ConsolidatorConfig;
}

interface SessionState {
	readonly id: string;
	readonly repository: MemoryRepository;
	readonly history: History;
	readonly service: MemoryService;
	readonly runner: Runner;
	readonly l1: ReturnType<typeof createL1>;
	requested: boolean;
}

export interface MemoryRuntime {
	readonly sessionId: string;
	getService(): MemoryService;
	buildPrompt(): string;
	getOperationContext(
		command: MainMemoryCommand,
		reasonCode?: string,
		reason?: string,
	): {
		sessionId: string;
		reasonCode: string;
		reason?: string;
	};
	recordMainResult(command: MainMemoryCommand, result: MemoryServiceResult): void;
	requestConsolidation(): void;
	prepare(model: Model<Api>, signal?: AbortSignal): Promise<void>;
	reset(): void;
}

export function createMemoryRuntime(deps: MemoryRuntimeDeps): MemoryRuntime {
	let state: SessionState | undefined;

	const currentState = (): SessionState => {
		const id = deps.sessionManager.id;
		if (state?.id === id) return state;

		const repository = createMemoryRepository(deps.sessionManager.dirPath, deps.limits);
		const history = createHistory(deps.sessionManager.dirPath, id);
		const service = createMemoryService({ repository, eventBus: deps.eventBus });
		const runner = createRunner({
			eventBus: deps.eventBus,
			stream: (model, context, options) =>
				deps.llm.stream(model, context, {
					signal: options?.signal,
					reasoning: options?.reasoning,
				}),
			repository,
			history,
			memoryService: service,
			config: {
				maxTurns: deps.config.maxTurns,
				maxTools: deps.config.maxTools,
				timeoutMs: deps.config.timeoutMs,
			},
		});
		state = {
			id,
			repository,
			history,
			service,
			runner,
			l1: createL1(repository),
			requested: false,
		};
		return state;
	};

	return {
		get sessionId() {
			return deps.sessionManager.id;
		},
		getService() {
			return currentState().service;
		},
		buildPrompt() {
			return currentState().l1.buildPrompt();
		},
		getOperationContext(command, reasonCode, reason) {
			return {
				sessionId: deps.sessionManager.id,
				reasonCode: reasonCode ?? (command.action === "add"
					? "memory_add"
					: `memory_${command.action}`),
				...(reason ? { reason } : {}),
			};
		},
		recordMainResult(command, result) {
			if (!result.ok && command.action === "add" && result.error.code === "capacity_exceeded") {
				currentState().requested = true;
			}
		},
		requestConsolidation() {
			currentState().requested = true;
		},
		async prepare(model, signal) {
			const current = currentState();
			const cursor = current.history.readCursor();
			const history = current.history.read(cursor);
			const snapshot = current.repository.readSnapshot();
			const decision = checkTrigger({
				snapshot,
				history,
				cursor,
				requested: current.requested,
				config: {
					operationLimit: deps.config.trigger.operations,
					capacityRatio: deps.config.trigger.capacity,
				},
			});
			if (!decision) return;

			const resolved = resolveModel(deps.llm, deps.config.model, model);
			if (!resolved.ok) return;
			const result = await current.runner.run({
				model: resolved.value,
				decision,
				sessionId: current.id,
				signal,
			});
			if (result.status === "completed" && current.requested) {
				current.requested = false;
			}
		},
		reset() {
			state = undefined;
		},
	};
}
