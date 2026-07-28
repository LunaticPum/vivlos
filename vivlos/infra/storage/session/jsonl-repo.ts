import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { getSessionsDir } from "../../paths.ts";
import { shortId } from "@vivlos/shared/utils/id.ts";
import { getContextTokens } from "@vivlos/shared/utils/tokens.ts";
import type { Message, Usage } from "@earendil-works/pi-ai";
import type { SessionHeader, SessionEntry, SessionMeta, MessageEntry, CompactionEntry } from "./types.ts";
import { toMessageEntry, toMessage } from "./types.ts";

/**
 * JSONL Session 仓储。
 *
 * 每个 session = .vivlos/sessions/{时间戳}_{id}/ 目录，内含 history.jsonl。
 * 延迟创建：第一条消息写入时才生成目录和文件，之前只有 pending ID。
 */

/** 生成可读的目录名时间戳 */
function tsName(): string {
	return new Date().toISOString().replace(/T/g, "-").replace(/:/g, "-").replace(/\..+/, "");
}

/** 生成 session 目录名 */
function sessionDirName(header: SessionHeader): string {
	return `${tsName()}_${header.id}`;
}

/**
 * 创建 pending session（不写文件）。
 * 只有第一条消息通过 ensureSession 才会实际创建文件，
 * 这样不会产生空 session 的 JSONL 文件。
 */
export function createSession(name?: string | null): { header: SessionHeader; filePath: string } {
	const id = shortId();
	const header: SessionHeader = {
		type: "session",
		version: 1,
		id,
		createdAt: new Date().toISOString(),
		name: name ?? null,
	};
	const filePath = resolve(getSessionsDir(), sessionDirName(header), "history.jsonl");
	return { header, filePath };
}

/**
 * 确保 session 文件存在。
 * 由 SessionManager.appendMessage 调用，
 * 只在首次写入消息时才创建文件。
 */
export function ensureSession(header: SessionHeader, filePath: string): void {
	if (existsSync(filePath)) return;
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(header)}\n`, "utf-8");
}

/** 打开已有 session，返回 header + 所有 entries */
export function openSession(filePath: string): { header: SessionHeader; entries: SessionEntry[] } {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n").filter((l) => l.trim());
	if (lines.length === 0) throw new Error(`Empty session file: ${filePath}`);

	const header = JSON.parse(lines[0]!) as SessionHeader;
	const entries: SessionEntry[] = [];
	for (let i = 1; i < lines.length; i++) {
		entries.push(JSON.parse(lines[i]!) as SessionEntry);
	}
	return { header, entries };
}

/** 向 session 追加一条 entry */
export function appendEntry(filePath: string, entry: SessionEntry): void {
	appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8");
}

/** 读取 session 的所有 Message（过滤 type="message"） */
export function loadMessages(filePath: string): Message[] {
	if (!existsSync(filePath)) return [];
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n").filter((l) => l.trim());
	const messages: Message[] = [];
	for (let i = 1; i < lines.length; i++) {
		const entry = JSON.parse(lines[i]!) as SessionEntry;
		if (entry.type === "message") {
			messages.push(toMessage(entry));
		}
	}
	return messages;
}

/** 列出所有 session 元信息 */
export function listSessions(): SessionMeta[] {
	const dir = getSessionsDir();
	if (!existsSync(dir)) return [];

	const sessionDirs = readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => join(dir, e.name));

	const results: SessionMeta[] = [];
	for (const sessionDir of sessionDirs) {
		const filePath = join(sessionDir, "history.jsonl");
		if (!existsSync(filePath)) continue;
		const { header, entries } = openSession(filePath);
		const messages = entries.filter((e) => e.type === "message") as MessageEntry[];
		const lastTs = messages.length > 0 ? messages[messages.length - 1]!.timestamp : 0;
		let turnCount = 0;
		let totalTokens = 0;
		for (const m of messages) {
			if (m.role === "user") turnCount++;
			if (m.role === "assistant" && m.usage) {
				totalTokens = getContextTokens(m.usage as Usage);
			}
		}
		results.push({
			id: header.id,
			name: header.name,
			createdAt: new Date(header.createdAt).getTime(),
			lastActiveAt: lastTs,
			messageCount: messages.length,
			turnCount,
			totalTokens,
			filePath,
		});
	}
	return results.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/** 删除 session（删除整个 session 目录） */
export function deleteSession(filePath: string): void {
	const dirPath = dirname(filePath);
	if (existsSync(dirPath)) {
		rmSync(dirPath, { recursive: true, force: true });
	}
}

/** 重命名 session（重写 header 行） */
export function renameSession(filePath: string, name: string): void {
	const { header, entries } = openSession(filePath);
	const newHeader: SessionHeader = { ...header, name };
	const lines = [JSON.stringify(newHeader), ...entries.map((e) => JSON.stringify(e))];
	writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

/** 仅在 session 尚未命名时写入名称。 */
export function renameSessionIfUnnamed(filePath: string, name: string): boolean {
	const { header, entries } = openSession(filePath);
	if (header.name !== null) return false;
	const newHeader: SessionHeader = { ...header, name };
	const lines = [JSON.stringify(newHeader), ...entries.map((e) => JSON.stringify(e))];
	writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
	return true;
}

/** 追加 Message（自动转为 entry） */
export function appendMessage(filePath: string, message: Message): void {
	appendEntry(filePath, toMessageEntry(message));
}

/** 追加 Compaction entry（记录一次压缩的摘要） */
export function appendCompaction(
	filePath: string,
	entry: CompactionEntry,
): void {
	appendEntry(filePath, entry);
}
