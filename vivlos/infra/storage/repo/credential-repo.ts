/**
 * SQLite-backed CredentialStore 实现。
 *
 * 实现 pi-ai 的 CredentialStore 接口，底层委托 ConfigRepository (KV store)。
 * key 格式为 "credential:${providerId}"，value 为 JSON 序列化的 Credential。
 *
 * 可传入 createLLM(config, createSqliteCredentialStore(path))，
 * 替代默认的 InMemoryCredentialStore，实现 API key 重启不丢失。
 */

import type { Credential, CredentialStore, CredentialInfo } from "@earendil-works/pi-ai";
import type { ConfigRepository } from "./config-repo.ts";

/**
 * 创建基于 SQLite 的 CredentialStore。
 *
 * 实现 `read` / `modify` / `delete` 三个方法，
 * 全部同步写入 SQLite（通过 ConfigRepository）。
 */
export function createSqliteCredentialStore(
  configRepo: ConfigRepository,
): CredentialStore {
  return {
    async read(providerId) {
      return configRepo.get<Credential>(`credential:${providerId}`);
    },

    async modify(providerId, fn) {
      const current = configRepo.get<Credential>(`credential:${providerId}`);
      const updated = await fn(current);
      if (updated !== undefined) {
        configRepo.set(`credential:${providerId}`, updated);
      }
      return updated;
    },

    async delete(providerId) {
      configRepo.remove(`credential:${providerId}`);
    },

    async list(): Promise<readonly CredentialInfo[]> {
      const PREFIX = "credential:";
      return configRepo
        .listKeys(PREFIX)
        .map((key) => {
          const cred = configRepo.get<Credential>(key);
          if (!cred) return null;
          return { providerId: key.slice(PREFIX.length), type: cred.type };
        })
        .filter((c): c is CredentialInfo => c !== null);
    },
  };
}
