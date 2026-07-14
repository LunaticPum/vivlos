/**
 * LLM 配置持久化仓储。
 *
 * 基于 ConfigRepository（KV store）实现，负责：
 * - 默认 provider/model 的持久化与恢复
 * - Recent providers/models 列表（最近使用，最多 5 个）
 * - 自定义 provider 配置的 CRUD
 */

import type { LLMConfig, CustomProviderConfig } from "../../llm/types.ts";
import type { ConfigRepository } from "./config-repo.ts";

const MAX_RECENT = 5;

/** LLM 配置持久化仓储接口 */
export interface LLMConfigRepository {
  // ── 默认配置 ──
  loadConfig(): LLMConfig | undefined;
  saveConfig(config: LLMConfig): void;

  // ── Recent providers ──
  loadRecentProviders(): string[];
  /** 追加最近使用的 provider（已存在的移到最前，去重，最多 MAX_RECENT 个） */
  addRecentProvider(id: string): void;

  // ── Recent models ──
  loadRecentModels(): string[];
  /** 追加最近使用的 model，逻辑同 addRecentProvider */
  addRecentModel(id: string): void;

  // ── 自定义 provider ──
  saveCustomProvider(id: string, config: CustomProviderConfig): void;
  loadCustomProvider(id: string): CustomProviderConfig | undefined;
  listCustomProviders(): string[];
  removeCustomProvider(id: string): void;
}

/** 创建基于 ConfigRepository 的 LLM 配置仓储 */
export function createLLMConfigRepository(
  configRepo: ConfigRepository,
): LLMConfigRepository {
  return {
    // ── 默认配置 ──
    loadConfig() {
      return configRepo.get<LLMConfig>("llm:config");
    },

    saveConfig(config) {
      configRepo.set("llm:config", config);
    },

    // ── Recent providers ──
    loadRecentProviders() {
      return configRepo.get<string[]>("recent:providers") ?? [];
    },

    addRecentProvider(id) {
      const list = configRepo.get<string[]>("recent:providers") ?? [];
      const idx = list.indexOf(id);
      if (idx === 0) return; // 已是第一个，不动
      if (idx > 0) list.splice(idx, 1); // 去重
      list.unshift(id);
      if (list.length > MAX_RECENT) list.pop();
      configRepo.set("recent:providers", list);
    },

    // ── Recent models ──
    loadRecentModels() {
      return configRepo.get<string[]>("recent:models") ?? [];
    },

    addRecentModel(id) {
      const list = configRepo.get<string[]>("recent:models") ?? [];
      const idx = list.indexOf(id);
      if (idx === 0) return;
      if (idx > 0) list.splice(idx, 1);
      list.unshift(id);
      if (list.length > MAX_RECENT) list.pop();
      configRepo.set("recent:models", list);
    },

    // ── 自定义 provider ──
    saveCustomProvider(id, config) {
      configRepo.set(`custom:${id}`, config);
    },

    loadCustomProvider(id) {
      return configRepo.get<CustomProviderConfig>(`custom:${id}`);
    },

    listCustomProviders() {
      return configRepo.listKeys("custom:").map((k) => k.slice("custom:".length));
    },

    removeCustomProvider(id) {
      configRepo.remove(`custom:${id}`);
    },
  };
}
