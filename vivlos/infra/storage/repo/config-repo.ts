/**
 * 通用 KV 配置存储。
 *
 * 一张 kv_store 表覆盖所有配置类持久化需求：
 * LLMConfig、Recent 列表、CustomProvider、Credential 等。
 * value 列存 JSON 字符串，get/set 自动序列化/反序列化。
 */

import type { Database } from "bun:sqlite";
import { getDb } from "../db.ts";

/**
 * KV 模块表结构定义。
 * 由 db.ts 的 getDb() 调用。
 */
export function initConfigSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

/** 通用 KV 仓储接口 */
export interface ConfigRepository {
  /** 读取并反序列化 JSON，不存在返回 undefined */
  get<T>(key: string): T | undefined;
  /** 序列化为 JSON 并 UPSERT */
  set<T>(key: string, value: T): void;
  /** 删除指定 key */
  remove(key: string): void;
  /** 检查 key 是否存在 */
  has(key: string): boolean;
  /** 列出指定前缀的所有 key（prefix 为空时返回全部） */
  listKeys(prefix?: string): string[];
}

/** 创建基于 SQLite 的 ConfigRepository */
export function createSqliteConfigRepository(dbPath: string): ConfigRepository {
  const db = getDb(dbPath);

  const stmtGet = db.prepare("SELECT value FROM kv_store WHERE key = ?");
  const stmtSet = db.prepare(`
    INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const stmtRemove = db.prepare("DELETE FROM kv_store WHERE key = ?");
  const stmtHas = db.prepare("SELECT 1 FROM kv_store WHERE key = ?");
  const stmtListAll = db.prepare("SELECT key FROM kv_store ORDER BY key");
  const stmtListPrefix = db.prepare("SELECT key FROM kv_store WHERE key LIKE ? ORDER BY key");

  return {
    get<T>(key: string): T | undefined {
      const row = stmtGet.get(key) as { value: string } | undefined;
      if (!row) return undefined;
      return JSON.parse(row.value) as T;
    },

    set<T>(key: string, value: T): void {
      const json = JSON.stringify(value);
      stmtSet.run(key, json, Date.now());
    },

    remove(key: string): void {
      stmtRemove.run(key);
    },

    has(key: string): boolean {
      return stmtHas.get(key) !== undefined;
    },

    listKeys(prefix?: string): string[] {
      if (!prefix) {
        return (stmtListAll.all() as Array<{ key: string }>).map((r) => r.key);
      }
      return (
        stmtListPrefix.all(`${prefix}%`) as Array<{ key: string }>
      ).map((r) => r.key);
    },
  };
}
