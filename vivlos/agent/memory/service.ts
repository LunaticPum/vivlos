import type { MemorySecurity, MemorySecurityViolation } from "./security.ts";
import type {
	MemoryCommand,
	MemoryCommandContext,
	MemoryCommandErrorCode,
	MemoryCommandResult,
	MemoryMutation,
	MemoryService,
	MemoryStore,
	MemoryStoreSnapshot,
} from "./types.ts";
import type { MemoryEventDraft } from "./events/journal.ts";
import type { MemoryEvent } from "./events/types.ts";

// #region Service 主入口

export interface MemoryServiceDependencies {
	readonly store: MemoryStore;
	readonly security: MemorySecurity;
	readonly appendEvent: (draft: MemoryEventDraft) => MemoryEvent;
}

/** 创建主模型 Memory 命令的统一业务入口。 */
export function createMemoryService({
	store,
	security,
	appendEvent,
}: MemoryServiceDependencies): MemoryService {
	return {
		executeMainCommand(rawCommand, context) {
			validateCommandContext(context);
			const command = normalizeCommand(rawCommand);
			const before = store.readSnapshot();
			const finish = (result: MemoryCommandResult): MemoryCommandResult => {
				appendEvent(toEventDraft(result, context));
				return result;
			};

			const operationViolation = security.validateOperation({
				actor: "main",
				action: command.action,
				reasonCode: command.reasonCode,
			})[0];
			if (operationViolation) {
				return finish(rejectedViolation(command, operationViolation, before.revision));
			}

			const reasonViolation = validateReason(command.reason, security);
			if (reasonViolation) {
				return finish(rejectedViolation(command, reasonViolation, before.revision));
			}

			const candidate = candidateFor(command, before);
			if (candidate !== null) {
				const contentViolation = security.scanCandidate(candidate)[0];
				if (contentViolation) {
					return finish(rejectedViolation(command, contentViolation, before.revision));
				}
			}

			const mutation = executeStoreCommand(store, command);
			if (!mutation.ok) {
				return finish(rejected(
					command,
					mutation.error.code,
					mutation.error.message,
					before.revision,
				));
			}

			const after = store.readSnapshot();
			return finish(
				committed(command, mutation.value, before.revision, after.revision),
			);
		},
	};
}

// #endregion

// #region 命令规范化与校验

function normalizeCommand(command: MemoryCommand): MemoryCommand {
	const reason = command.reason?.trim();
	const metadata = {
		reasonCode: command.reasonCode,
		...(reason ? { reason } : {}),
	};
	switch (command.action) {
		case "add":
			return { ...metadata, action: "add", file: command.file, content: command.content.trim() };
		case "replace":
			return {
				...metadata,
				action: "replace",
				file: command.file,
				oldText: command.oldText.trim(),
				newText: command.newText.trim(),
			};
		case "remove":
			return { ...metadata, action: "remove", file: command.file, oldText: command.oldText.trim() };
	}
}

function validateReason(
	reason: string | undefined,
	security: MemorySecurity,
): MemorySecurityViolation | null {
	if (!reason) return null;
	if (reason.length > 200) {
		return {
			type: "invalid_input",
			code: "reason_too_long",
			message: "reason 不能超过 200 个字符",
		};
	}
	return security.scanCandidate(reason)[0] ?? null;
}

function validateCommandContext(context: MemoryCommandContext): void {
	if (!context.sessionId.trim() || !context.turnId.trim()) {
		throw new Error("MemoryCommandContext 需要非空的 sessionId 和 turnId");
	}
	if (
		context.sourceMessageIds.length === 0 ||
		context.sourceMessageIds.some((id) => !id.trim())
	) {
		throw new Error("MemoryCommandContext 需要至少一个非空 sourceMessageId");
	}
}

/** add 扫描完整条目；replace 在唯一命中时扫描替换后的完整条目。 */
function candidateFor(
	command: MemoryCommand,
	snapshot: MemoryStoreSnapshot,
): string | null {
	switch (command.action) {
		case "add":
			return command.content;
		case "replace": {
			const matches = snapshot.entries[command.file].filter((entry) =>
				entry.includes(command.oldText),
			);
			if (!command.oldText || matches.length !== 1) return command.newText;
			return matches[0]!.replace(command.oldText, command.newText).trim();
		}
		case "remove":
			return null;
	}
}

// #endregion

// #region Store 调用

function executeStoreCommand(store: MemoryStore, command: MemoryCommand) {
	switch (command.action) {
		case "add":
			return store.add(command.file, command.content);
		case "replace":
			return store.replace(command.file, command.oldText, command.newText);
		case "remove":
			return store.remove(command.file, command.oldText);
	}
}

// #endregion

// #region 领域结果

function committed(
	command: MemoryCommand,
	mutation: MemoryMutation,
	revisionBefore: string,
	revisionAfter: string,
): MemoryCommandResult {
	return {
		ok: true,
		command,
		revisionBefore,
		revisionAfter,
		value: {
			status: mutation.status === "written" ? "committed" : "noop",
			file: mutation.file,
			before: mutation.before,
			after: mutation.after,
			usage: mutation.usage,
		},
	};
}

function rejectedViolation(
	command: MemoryCommand,
	violation: MemorySecurityViolation,
	revision: string,
): MemoryCommandResult {
	return rejected(
		command,
		errorCodeFor(violation),
		violation.message,
		revision,
	);
}

function rejected(
	command: MemoryCommand,
	code: MemoryCommandErrorCode,
	message: string,
	revision: string,
): MemoryCommandResult {
	return {
		ok: false,
		command,
		revisionBefore: revision,
		revisionAfter: revision,
		error: { code, message },
	};
}

function errorCodeFor(violation: MemorySecurityViolation): MemoryCommandErrorCode {
	switch (violation.type) {
		case "invalid_input":
			return "invalid_input";
		case "unsafe_content":
			return "unsafe_content";
		case "forbidden_operation":
			return "forbidden_operation";
	}
}

function toEventDraft(
	result: MemoryCommandResult,
	context: MemoryCommandContext,
): MemoryEventDraft {
	const base = {
		sessionId: context.sessionId,
		turnId: context.turnId,
		actor: "main" as const,
		file: result.command.file,
		sourceMessageIds: [...context.sourceMessageIds],
	};

	if (!result.ok) {
		return {
			...base,
			action: "reject",
			reasonCode:
				result.error.code === "unsafe_content"
					? "security_rejection"
					: "invalid_operation",
			reason: result.error.message.slice(0, 200),
			status: "rejected",
		};
	}
	if (result.value.status === "noop") {
		return {
			...base,
			action: "duplicate",
			reasonCode: "duplicate_suppression",
			...(result.command.reason ? { reason: result.command.reason } : {}),
			before: result.value.before,
			after: result.value.after,
			status: "noop",
		};
	}
	return {
		...base,
		action: result.command.action,
		reasonCode: result.command.reasonCode,
		...(result.command.reason ? { reason: result.command.reason } : {}),
		before: result.value.before,
		after: result.value.after,
		status: "committed",
	};
}

// #endregion
