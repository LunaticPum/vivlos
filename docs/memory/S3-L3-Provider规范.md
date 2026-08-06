# S3 L3 Provider 规范

> **通俗解释**：L3 是一个可选的"外接记忆服务"插槽——接入第三方语义记忆、用户画像或知识图服务（如 Mem0）。启用后，每个 User Turn（对话轮次）前自动召回少量相关内容（prefetch，预取），Turn 后把对话同步给服务（sync），Session（会话）结束时提取长期事实（extract）。触发场景：仅当用户显式配置并启用某个 Provider（第三方服务适配器）；同一时刻只允许一个 Provider 激活。首期只定契约和空实现，不接真实服务。

## 1. Provider 接口

```ts
interface MemoryProvider {
    readonly id: string;
    readonly displayName: string;

    setup(config: ProviderConfig): Promise<Result<void, ProviderError>>;
    status(): Promise<ProviderStatus>;
    off(): Promise<void>;

    prefetch(query: string, opts: PrefetchOptions): Promise<MemoryContextItem[]>;
    sync(turn: TurnRecord): Promise<void>;
    extract(sessionId: string): Promise<void>;

    search(query: string, opts: SearchOptions): Promise<MemoryContextItem[]>;
    remove(filter: RemoveFilter): Promise<void>;
    export(): Promise<ExportResult>;
}

interface ProviderStatus {
    readonly active: boolean;
    readonly connected: boolean;
    readonly lastSyncAt?: number;
    readonly message?: string;
}
```

约束：

- 所有方法必须可失败；调用方（Coordinator）统一加超时（默认 5s）并捕获异常。
- `prefetch` / `sync` / `extract` 失败只记日志，绝不阻塞主对话。
- Provider 不直接写 L1；提取的候选事实只能作为召回内容呈现，提升走 S0 第 5 节规则。

## 2. 生命周期映射

```mermaid
flowchart LR
    subgraph Turn["每个 User Turn"]
        BT["beforeTurn"] -->|prefetch(query)| CTX["瞬时 Context"]
        AT["afterTurn"] -->|sync(turnRecord)| R["远端服务"]
    end
    SE["sessionEnd"] -->|extract(sessionId)| R
    ST["status / off"] -->|用户命令| R
```

| 钩子 | Provider 方法 | 输入 | 输出 |
| --- | --- | --- | --- |
| beforeTurn | `prefetch` | 当前用户消息文本 | `MemoryContextItem[]`（≤5 条） |
| afterTurn | `sync` | 本轮 canonical 消息 | 无 |
| sessionEnd | `extract` | sessionId | 无（远端自行提取） |
| 用户命令 | `search` / `remove` / `export` | 显式参数 | Tool Result |

## 3. 单活与切换

- 同一 Workspace 同一时刻只有一个 Active Provider，配置保存在 `memory.db` 的 `l3_active` 表。
- 切换 Provider 不迁移、不合并旧 Provider 的远端数据。
- `off()` 只停用本地调用，不删除远端数据；删除需显式 `remove`。

## 4. 本地映射表

```sql
CREATE TABLE IF NOT EXISTS l3_mappings (
    provider_id  TEXT NOT NULL,
    local_type   TEXT NOT NULL,   -- workspace / session / message / memory
    local_id     TEXT NOT NULL,
    remote_id    TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (provider_id, local_type, local_id)
);

CREATE TABLE IF NOT EXISTS l3_active (
    workspace    TEXT PRIMARY KEY DEFAULT 'default',
    provider_id  TEXT,
    config_json  TEXT,
    updated_at   INTEGER
);
```

## 5. 首期实现范围

| 项 | 首期 | 后续 |
| --- | --- | --- |
| `MemoryProvider` 接口与类型 | 实现 | — |
| Registry（注册 / 查询 / 切换 Active） | 实现 | — |
| NullProvider（未启用时的空实现） | 实现 | — |
| MockProvider（测试用，本地内存存储） | 实现 | — |
| Coordinator 钩子接入 | 实现 | — |
| 真实第三方 Adapter | 不实现 | 按需添加 |
| provider 管理 Tool / TUI | 不实现 | 按需添加 |

## 6. 成本与隐私基线

即使首期不接真实服务，接口契约必须支持：

- `prefetch` 条数上限（默认 5）与单条长度上限（默认 600 字符）。
- `sync` 批次只包含当前 Turn 的 canonical 消息，不重发全量历史。
- 超时与离线降级：网络失败时 Provider 保持 `connected=false`，钩子静默跳过。
- 凭证由现有 credential store 管理，不写入 `memory.db` 明文。
