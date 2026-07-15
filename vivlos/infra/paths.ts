import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

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
