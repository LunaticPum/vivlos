/**
 * Memory Service。
 *
 * Service 是主动记忆和巩固记忆访问 Security、Repository 与 EventBus 的
 * 唯一编排入口。所有预期业务失败都在写盘前终止并发布 rejected 留痕。
 */

import {
	applyConsolidationCommand,
	type ConsolidationLogicError,
	type ConsolidationMemoryCommand,
} from "./consolidate.ts";
import {
	applyMainCommand,
	type MainMemoryCommand,
	type MemoryLogicError,
} from "./memory.ts";
import {
	checkPermission,
	scanContent,
	type SecurityViolation,
	type SecurityViolationCode,
} from "../../security.ts";
import type { MemoryAction, MemoryActor } from "../../types.ts";

import type {
	EventBus,
	MemoryOperationEvent,
} from "@vivlos/infra/eventbus/index.ts";
import type {
	MemoryFile,
	MemoryFileUsage,
	MemoryRepository,
	MemoryRepositoryError,
	MemoryStorageSnapshot,
} from "@vivlos/infra/storage/memory/repository.ts";
import { err, ok, type Result, uid } from "@vivlos/shared";

// #region 操作上下文

/** 调用方提供的 session、原因和来源上下文。 */
export interface MemoryOperationContext {
	readonly sessionId: string;
	readonly reasonCode: string;
	readonly reason?: string;
	readonly source?: {
		readonly sessionId: string;
		readonly historyLine: number;
	};
}

// #endregion

// #region 结果

interface MemoryServiceValueBase {
	readonly actor: MemoryActor;
	readonly action: MemoryAction;
	readonly file: MemoryFile;
	readonly before?: string;
	readonly beforeEntries?: readonly string[];
	readonly after?: string;
	readonly usage: MemoryFileUsage;
	readonly revisionBefore: string;
	readonly revisionAfter: string;
}

/** Service 成功终态；status 与 changed 在类型上保持一致。 */
export type MemoryServiceValue = MemoryServiceValueBase &
	(
		| { readonly status: "committed"; readonly changed: true }
		| { readonly status: "noop"; readonly changed: false }
	);

export type MemoryServiceErrorCode =
	| MemoryLogicError["code"]
	| ConsolidationLogicError["code"]
	| SecurityViolationCode
	| MemoryRepositoryError["code"];

/** 预期失败终态；携带当前状态，但不返回原始不安全候选。 */
export interface MemoryServiceError {
	readonly code: MemoryServiceErrorCode;
	readonly message: string;
	readonly actor: MemoryActor;
	readonly action: MemoryAction;
	readonly file: MemoryFile;
	readonly usage: MemoryFileUsage;
	readonly revisionBefore: string;
	readonly revisionAfter: string;
	readonly violations?: readonly SecurityViolation[];
}

export type MemoryServiceResult = Result<
	MemoryServiceValue,
	MemoryServiceError
>;

// #endregion

// #region Service 与依赖

export interface MemoryService {
	executeMain(
		command: MainMemoryCommand,
		context: MemoryOperationContext,
	): MemoryServiceResult;
	executeConsolidation(
		command: ConsolidationMemoryCommand,
		context: MemoryOperationContext,
	): MemoryServiceResult;
}

/** createMemoryService 后续实现所需的最小依赖。 */
export interface MemoryServiceDependencies {
	readonly repository: MemoryRepository;
	readonly eventBus: EventBus;
}

// #endregion

// #region 工厂

/** 创建绑定 Repository 与 EventBus 的 Memory Service。 */
export function createMemoryService(
	dependencies: MemoryServiceDependencies,
): MemoryService {
	return {
		executeMain(command, context) {
			const snapshot = dependencies.repository.readSnapshot();
			const permission = checkPermission("main", command.action);
			if (permission) {
				return rejectOperation(
					dependencies,
					"main",
					command,
					context,
					snapshot,
					permission,
				);
			}

			const logicResult = applyMainCommand(
				snapshot.entries[command.file],
				command,
			);
			if (!logicResult.ok) {
				return rejectOperation(
					dependencies,
					"main",
					command,
					context,
					snapshot,
					logicResult.error,
				);
			}

			return finalizeOperation(
				dependencies,
				"main",
				command,
				context,
				snapshot,
				{
					changed: logicResult.value.changed,
					entries: logicResult.value.entries,
					before: logicResult.value.before,
					after: logicResult.value.after,
				},
			);
		},

		executeConsolidation(command, context) {
			const snapshot = dependencies.repository.readSnapshot();
			const permission = checkPermission("consolidator", command.action);
			if (permission) {
				return rejectOperation(
					dependencies,
					"consolidator",
					command,
					context,
					snapshot,
					permission,
				);
			}

			const logicResult = applyConsolidationCommand(
				snapshot.entries[command.file],
				command,
			);
			if (!logicResult.ok) {
				return rejectOperation(
					dependencies,
					"consolidator",
					command,
					context,
					snapshot,
					logicResult.error,
				);
			}

			return finalizeOperation(
				dependencies,
				"consolidator",
				command,
				context,
				snapshot,
				{
					changed: logicResult.value.changed,
					entries: logicResult.value.entries,
					before:
						command.action === "refine"
							? logicResult.value.before[0]
							: undefined,
					beforeEntries:
						command.action === "merge" ? logicResult.value.before : undefined,
					after: logicResult.value.after,
				},
			);
		},
	};
}

// #endregion

interface PreparedOperation {
	readonly changed: boolean;
	readonly entries: readonly string[];
	readonly before?: string;
	readonly beforeEntries?: readonly string[];
	readonly after?: string;
}

// #region 终态提交

function finalizeOperation(
	dependencies: MemoryServiceDependencies,
	actor: MemoryActor,
	command: MainMemoryCommand | ConsolidationMemoryCommand,
	context: MemoryOperationContext,
	snapshot: MemoryStorageSnapshot,
	prepared: PreparedOperation,
): MemoryServiceResult {
	if (!prepared.changed) {
		const value = createServiceValue(
			actor,
			command,
			snapshot,
			snapshot,
			prepared,
		);
		emitOperation(dependencies.eventBus, context, value);
		return ok(value);
	}

	if (prepared.after !== undefined) {
		const violations = scanContent(prepared.after);
		if (violations.length > 0) {
			return rejectOperation(
				dependencies,
				actor,
				command,
				context,
				snapshot,
				violations[0]!,
				violations,
			);
		}
	}

	const writeResult = dependencies.repository.write(
		command.file,
		prepared.entries,
	);
	if (!writeResult.ok) {
		return rejectOperation(
			dependencies,
			actor,
			command,
			context,
			snapshot,
			writeResult.error,
		);
	}

	const value = createServiceValue(
		actor,
		command,
		snapshot,
		writeResult.value,
		prepared,
	);
	emitOperation(dependencies.eventBus, context, value);
	if (value.changed) {
		dependencies.eventBus.emit({
			type: "memory:changed",
			sessionId: context.sessionId,
			file: command.file,
			revisionBefore: snapshot.revision,
			revisionAfter: writeResult.value.revision,
		});
	}
	return ok(value);
}

// #endregion

// #region 结果与 Event

function createServiceValue(
	actor: MemoryActor,
	command: MainMemoryCommand | ConsolidationMemoryCommand,
	beforeSnapshot: MemoryStorageSnapshot,
	afterSnapshot: MemoryStorageSnapshot,
	prepared: PreparedOperation,
): MemoryServiceValue {
	const common: MemoryServiceValueBase = {
		actor,
		action: command.action,
		file: command.file,
		before: prepared.before,
		beforeEntries: prepared.beforeEntries,
		after: prepared.after,
		usage: afterSnapshot.usage[command.file],
		revisionBefore: beforeSnapshot.revision,
		revisionAfter: afterSnapshot.revision,
	};
	if (beforeSnapshot.revision === afterSnapshot.revision) {
		return { ...common, status: "noop", changed: false };
	}
	return { ...common, status: "committed", changed: true };
}

function emitOperation(
	eventBus: EventBus,
	context: MemoryOperationContext,
	value: MemoryServiceValue,
): void {
	eventBus.emit({
		type: "memory:operation",
		eventId: uid(),
		timestamp: Date.now(),
		sessionId: context.sessionId,
		actor: value.actor,
		action: value.action,
		outcome: value.status,
		file: value.file,
		reasonCode: context.reasonCode,
		reason: context.reason,
		before: value.before,
		beforeEntries: value.beforeEntries,
		after: value.after,
		revisionBefore: value.revisionBefore,
		revisionAfter: value.revisionAfter,
		source: context.source,
	});
}

function rejectOperation(
	dependencies: MemoryServiceDependencies,
	actor: MemoryActor,
	command: MainMemoryCommand | ConsolidationMemoryCommand,
	context: MemoryOperationContext,
	snapshot: MemoryStorageSnapshot,
	error: { readonly code: MemoryServiceErrorCode; readonly message: string },
	violations?: readonly SecurityViolation[],
): MemoryServiceResult {
	const event: MemoryOperationEvent = {
		type: "memory:operation",
		eventId: uid(),
		timestamp: Date.now(),
		sessionId: context.sessionId,
		actor,
		action: command.action,
		outcome: "rejected",
		file: command.file,
		reasonCode: context.reasonCode,
		reason: context.reason,
		revisionBefore: snapshot.revision,
		revisionAfter: snapshot.revision,
		source: context.source,
		errorCode: error.code,
		errorMessage: error.message,
	};
	dependencies.eventBus.emit(event);
	return err({
		code: error.code,
		message: error.message,
		actor,
		action: command.action,
		file: command.file,
		usage: snapshot.usage[command.file],
		revisionBefore: snapshot.revision,
		revisionAfter: snapshot.revision,
		violations,
	});
}

// #endregion
