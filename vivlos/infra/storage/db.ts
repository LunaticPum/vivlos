import { Database, type Database as DatabaseType } from "bun:sqlite";
import { initSessionSchema } from "./repo/session-repo.ts";
import { initMemorySchema } from "./repo/memory-repo.ts";
import { initConfigSchema } from "./repo/config-repo.ts";

const instances = new Map<string, DatabaseType>();

/**
 * 获取 SQLite 连接（按 dbPath 键控，同一 path 只打开一次）。
 * 使用 bun:sqlite（Bun 运行时内置，底层为 SQLite C 引擎）。
 *
 * 各业务模块的表结构由对应 repo 文件的 initXxxSchema(db) 负责，
 * db.ts 只管连接管理 + PRAGMA 设置。
 */
export function getDb(dbPath: string): DatabaseType {
  const existing = instances.get(dbPath);
  if (existing) return existing;

  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  // ── 各业务模块自管 schema ──
  initSessionSchema(db);
  initMemorySchema(db);
  initConfigSchema(db);

  instances.set(dbPath, db);
  return db;
}

/** 关闭所有数据库连接并 WAL checkpoint */
export function closeAll(): void {
  instances.forEach((db) => {
    try { db.run("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* ignore */ }
    db.close();
  });
  instances.clear();
}

export function closeDb(): void {
  closeAll();
}
