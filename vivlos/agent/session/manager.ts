import type { Message } from "@earendil-works/pi-ai";
import type { SessionManager } from "./types.ts";
import {
	createSession,
	openSession,
	appendMessage as repoAppend,
	loadMessages,
	listSessions,
	deleteSession,
	renameSession,
} from "@vivlos/infra/storage/session/index.ts";

/**
 * 创建基于 JSONL 文件的 SessionManager。
 *
 * 每个 session = .vivlos/sessions/ 下的一个 .jsonl 文件。
 * 消息 append-only，切换 session 时重新加载文件。
 */
export function createSessionManager(): SessionManager {
	// 启动时：恢复最近活跃的 session，没有则创建新的
	const sessions = listSessions();
	let current = sessions.length > 0
		? { header: openSession(sessions[0]!.filePath).header, filePath: sessions[0]!.filePath }
		: createSession();

	return {
		get id() { return current.header.id; },
		get filePath() { return current.filePath; },

		getMessages() {
			return loadMessages(current.filePath);
		},

		appendMessage(message: Message) {
			repoAppend(current.filePath, message);
		},

		reset() {
			// 删旧文件，建新 session
			deleteSession(current.filePath);
			current = createSession();
		},

		listSessions() {
			return listSessions();
		},

		switchTo(sessionId: string) {
			const sessions = listSessions();
			const target = sessions.find((s) => s.id === sessionId);
			if (!target) throw new Error(`Session not found: ${sessionId}`);
			const { header } = openSession(target.filePath);
			current = { header, filePath: target.filePath };
		},

		createNew(name?: string) {
			current = createSession(name);
		},

		deleteSession(sessionId: string) {
			const sessions = listSessions();
			const target = sessions.find((s) => s.id === sessionId);
			if (!target) return;
			deleteSession(target.filePath);
			// 如果删的是当前 session，切到最近的或新建
			if (target.id === current.header.id) {
				const remaining = listSessions();
				if (remaining.length > 0) {
					const { header } = openSession(remaining[0]!.filePath);
					current = { header, filePath: remaining[0]!.filePath };
				} else {
					current = createSession();
				}
			}
		},

		rename(name: string) {
			renameSession(current.filePath, name);
			current = { ...current, header: { ...current.header, name } };
		},
	};
}
