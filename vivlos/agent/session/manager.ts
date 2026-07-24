import type { Message } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { SessionManager } from "./types.ts";
import {
	createSession,
	ensureSession,
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
 * 延迟创建：启动时产生 pending sessionId（不写文件）。
 * 第一条消息写入时通过 ensureSession 创建文件。
 * 无消息的 pending session 不会产生 JSONL 文件。
 */
export function createSessionManager(): SessionManager {
	let current = createSession();
	let pending = true; // 文件尚未创建
	// 压缩后的消息覆盖（null = 从磁盘读）
	let messagesOverride: Message[] | null = null;

	return {
		get id() { return current.header.id; },
		get name() { return current.header.name; },
		get filePath() { return current.filePath; },
		get dirPath() { return dirname(current.filePath); },

		getMessages() {
			return messagesOverride ?? loadMessages(current.filePath);
		},

		appendMessage(message: Message) {
			// 首次写消息时激活 session（创建文件）
			if (pending && !existsSync(current.filePath)) {
				ensureSession(current.header, current.filePath);
				pending = false;
			}
			repoAppend(current.filePath, message);
			if (messagesOverride) {
				messagesOverride.push(message);
			}
		},

		replaceMessages(messages: Message[]) {
			messagesOverride = messages;
		},

		listSessions() {
			return listSessions();
		},

		switchTo(sessionId: string) {
			messagesOverride = null;
			const sessions = listSessions();
			const target = sessions.find((s) => s.id === sessionId);
			if (!target) throw new Error(`Session not found: ${sessionId}`);
			const { header } = openSession(target.filePath);
			current = { header, filePath: target.filePath };
			pending = false;
		},

		createNew(name?: string) {
			messagesOverride = null;
			current = createSession(name);
			pending = true;
		},

		deleteSession(sessionId: string) {
			const sessions = listSessions();
			const target = sessions.find((s) => s.id === sessionId);
			if (!target) return;
			deleteSession(target.filePath);
			// 删的是当前 session 时切到最近的或新建
			if (target.id === current.header.id) {
				if (pending) {
					current = createSession();
				} else {
					const remaining = listSessions();
					if (remaining.length > 0) {
						const { header } = openSession(remaining[0]!.filePath);
						current = { header, filePath: remaining[0]!.filePath };
					} else {
						current = createSession();
						pending = true;
					}
				}
			}
		},

		rename(name: string) {
			if (pending) {
				current = { ...current, header: { ...current.header, name } };
				return;
			}
			renameSession(current.filePath, name);
			current = { ...current, header: { ...current.header, name } };
		},
	};
}
