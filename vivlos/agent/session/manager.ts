import type { Message } from "@earendil-works/pi-ai";
import type { VivlosSession } from "./types.ts";
import {
	createSqliteSessionRepository,
	type SessionRepository,
} from "@vivlos/infra/storage/index.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";

export interface CreateSessionOptions {
	/** true = SQLite 持久化, false = 内存（默认 false） */
	readonly persistent?: boolean;
	/** SQLite 路径（persistent=true 时必需） */
	readonly dbPath?: string;
	/** session ID（可选，自动生成） */
	readonly id?: string;
}

/**
 * 创建 session 的统一入口。
 *
 * 内部根据 persistent 选择内存实现或 SQLite 实现。
 * SQLite 实现委托 infra 层的 SessionRepository 做 CRUD。
 */
export function createSession(options: CreateSessionOptions = {}): VivlosSession {
	if (options.persistent) {
		if (!options.dbPath) {
			throw new Error("persistent session requires dbPath");
		}
		return createPersistentSession(options.dbPath, options.id);
	}
	return createInMemorySession(options.id);
}

// ── 内存实现 ──
function createInMemorySession(id?: string): VivlosSession {
	let messages: Message[] = [];
	const sessionId = id ?? shortId();

	return {
		id: sessionId,
		getMessages() {
			return messages;
		},
		appendMessage(message) {
			messages = [...messages, message];
		},
		reset() {
			messages = [];
		},
	};
}

// ── SQLite 实现 —— 委托 SessionRepository 的 CRUD ──
function createPersistentSession(dbPath: string, id?: string): VivlosSession {
	const repo: SessionRepository = createSqliteSessionRepository(dbPath, id);

	return {
		id: repo.sessionId,
		getMessages() {
			return repo.getMessages();
		},
		appendMessage(message) {
			repo.appendMessage(message);
		},
		reset() {
			repo.clearMessages();
		},
	};
}