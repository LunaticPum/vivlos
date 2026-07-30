import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import { err, ok, type Result } from "@vivlos/shared";

// #region 公共契约

export type MemoryFile = "memory" | "user";

export interface MemoryLimits {
	readonly memory: number;
	readonly user: number;
}

export interface MemoryFileUsage {
	readonly used: number;
	readonly cap: number;
}

export interface MemoryStorageSnapshot {
	readonly entries: {
		readonly memory: readonly string[];
		readonly user: readonly string[];
	};
	readonly usage: {
		readonly memory: MemoryFileUsage;
		readonly user: MemoryFileUsage;
	};
	readonly revision: string;
}

export interface MemoryFileOverview {
	readonly exists: boolean;
	readonly path: string;
	readonly used: number;
	readonly cap: number;
	readonly entryCount: number;
	readonly updatedAt: number | null;
}

export interface MemoryStorageOverview {
	readonly directory: string;
	readonly memory: MemoryFileOverview;
	readonly user: MemoryFileOverview;
}

export interface MemoryOverview extends MemoryStorageOverview {
	readonly sessionId: string;
}

export interface MemoryFilesActivation {
	readonly memoryCreated: boolean;
	readonly userCreated: boolean;
}

export interface MemoryRepositoryError {
	readonly code: "invalid_entry" | "capacity_exceeded";
	readonly message: string;
	readonly file: MemoryFile;
}

export interface MemoryRepository {
	readSnapshot(): MemoryStorageSnapshot;
	write(
		file: MemoryFile,
		entries: readonly string[],
	): Result<MemoryStorageSnapshot, MemoryRepositoryError>;
}

export interface ManagedMemoryRepository extends MemoryRepository {
	ensureFiles(): MemoryFilesActivation;
	readOverview(): MemoryStorageOverview;
}

// #endregion

// #region Markdown 格式

const SEPARATOR = "\n---\n";
const SEPARATOR_PATTERN = /\r?\n---\r?\n/;
const SEPARATOR_LINE = /^[ \t]*---[ \t]*$/m;

// #endregion

// #region Repository 主入口

/** 创建绑定到单个 session 目录的 L1 Memory Repository。 */
export function createMemoryRepository(
	sessionDir: string,
	limits: MemoryLimits,
): ManagedMemoryRepository {
	const directory = resolve(sessionDir);
	const filePath = (file: MemoryFile) => resolve(directory, `${file}.md`);
	const read = (file: MemoryFile) => readEntries(filePath(file));

	const readSnapshot = (): MemoryStorageSnapshot =>
		createSnapshot(read("memory"), read("user"), limits);

	return {
		readSnapshot,
		ensureFiles() {
			mkdirSync(directory, { recursive: true });
			return {
				memoryCreated: ensureFile(filePath("memory")),
				userCreated: ensureFile(filePath("user")),
			};
		},
		readOverview() {
			const snapshot = readSnapshot();
			return {
				directory,
				memory: createFileOverview(
					filePath("memory"),
					snapshot.entries.memory.length,
					snapshot.usage.memory,
				),
				user: createFileOverview(
					filePath("user"),
					snapshot.entries.user.length,
					snapshot.usage.user,
				),
			};
		},

		write(file, rawEntries) {
			const entries = normalizeEntries(rawEntries);
			if (entries.some((entry) => SEPARATOR_LINE.test(entry))) {
				return err({
					code: "invalid_entry",
					message: "Memory 条目不能包含独立的 --- 分隔行",
					file,
				});
			}

			const content = serialize(entries);
			if (content.length > limits[file]) {
				return err({
					code: "capacity_exceeded",
					message: `写入后将达到 ${content.length}/${limits[file]} 字符`,
					file,
				});
			}

			mkdirSync(directory, { recursive: true });
			writeFileSync(filePath(file), content, "utf-8");
			return ok(readSnapshot());
		},
	};
}

// #endregion

// #region 文件读取与 Snapshot

function ensureFile(path: string): boolean {
	if (existsSync(path)) return false;
	writeFileSync(path, "", { encoding: "utf-8", flag: "wx" });
	return true;
}

function createFileOverview(
	path: string,
	entryCount: number,
	usage: MemoryFileUsage,
): MemoryFileOverview {
	const exists = existsSync(path);
	return {
		exists,
		path,
		used: usage.used,
		cap: usage.cap,
		entryCount,
		updatedAt: exists ? statSync(path).mtimeMs : null,
	};
}

function readEntries(path: string): string[] {
	if (!existsSync(path)) return [];
	const content = readFileSync(path, "utf-8").trim();
	if (!content) return [];
	return content
		.split(SEPARATOR_PATTERN)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function normalizeEntries(entries: readonly string[]): string[] {
	return entries.map((entry) => entry.trim()).filter(Boolean);
}

function serialize(entries: readonly string[]): string {
	return entries.length > 0 ? `${entries.join(SEPARATOR)}\n` : "";
}

function createSnapshot(
	memoryEntries: string[],
	userEntries: string[],
	limits: MemoryLimits,
): MemoryStorageSnapshot {
	const memoryContent = serialize(memoryEntries);
	const userContent = serialize(userEntries);
	const revision = createHash("sha256")
		.update(memoryContent)
		.update("\0")
		.update(userContent)
		.digest("hex");

	return {
		entries: { memory: memoryEntries, user: userEntries },
		usage: {
			memory: { used: memoryContent.length, cap: limits.memory },
			user: { used: userContent.length, cap: limits.user },
		},
		revision: `sha256:${revision}`,
	};
}

// #endregion
