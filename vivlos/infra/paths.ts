import { resolve } from "node:path";
import { mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";

const VIVLOS_DIR_NAME = ".vivlos";

/**
 * vivlos 运行时路径集中管理。
 *
 * 所有生成文件（SQLite DB、日志等）统一存放在
 * process.cwd()/.vivlos/ 下，避免污染项目根目录。
 *
 * env 覆盖：
 * - VIVLOS_DB_PATH  -> 覆盖 DB 路径
 * - VIVLOS_LOG_DIR  -> 覆盖日志目录
 */

/**
 * 获取 .vivlos 根目录绝对路径。
 * 默认基于 process.cwd()。
 */
export function getVivlosDir(): string {
	return resolve(process.cwd(), VIVLOS_DIR_NAME);
}

/**
 * 确保目录存在，不存在则递归创建。
 * 返回目录绝对路径。
 */
export function ensureDir(dir: string): string {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	return dir;
}

/** 确保 .vivlos 目录存在 */
export function ensureVivlosDir(): string {
	return ensureDir(getVivlosDir());
}

/** 获取 SQLite 数据库路径 */
export function getDbPath(): string {
	return resolve(getVivlosDir(), "vivlos.db");
}

/** 获取日志目录路径 */
export function getLogDir(): string {
	return resolve(getVivlosDir(), "logs");
}

/** 获取配置文件目录路径 */
export function getConfigDir(): string {
	return resolve(getVivlosDir(), "config");
}

/** 确保配置文件目录存在 */
export function ensureConfigDir(): string {
	return ensureDir(getConfigDir());
}

/** 获取 sessions 目录路径（JSONL 会话文件） */
export function getSessionsDir(): string {
	return resolve(getVivlosDir(), "sessions");
}

/** 确保 sessions 目录存在 */
export function ensureSessionsDir(): string {
	return ensureDir(getSessionsDir());
}

/** 获取临时文件目录路径 */
export function getTempDir(): string {
	return resolve(getVivlosDir(), "temp");
}

/** 确保临时文件目录存在 */
export function ensureTempDir(): string {
	return ensureDir(getTempDir());
}

/**
 * 清空临时文件目录。
 * 启动时调用，清理上次会话残留的临时文件。
 */
export function cleanTempDir(): void {
	const dir = getTempDir();
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir)) {
		rmSync(resolve(dir, entry), { recursive: true, force: true });
	}
}
