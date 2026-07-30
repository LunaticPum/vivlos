# vivlos — 个人 Agent 开发项目

## 项目定位

长期个人项目 + agent 开发学习项目。基于 pi agent SDK（`@earendil-works/pi-ai`）构建个人使用的 AI agent。核心代码在 `vivlos/`，`packages/` 是 pi agent 源码，作为 SDK 使用，**不随意改动**，新功能在 `vivlos/` 里封装实现。

## 技术栈

- Runtime: Node.js + TypeScript（ESM, strict）
- LLM SDK: `@earendil-works/pi-ai`（统一 LLM API + 自动模型发现，支持 OpenAI/Anthropic/Google/Bedrock 等）
- Agent 框架: `packages/agent`（agent loop、session、compaction、skills、system prompt）
- TUI: `packages/tui`（Ink-based 组件库）
- 测试: vitest
- 开发运行: tsx
- 持久化: SQLite（`better-sqlite3`，待引入）

## 架构：洋葱式分层

`vivlos/` 采用洋葱架构，依赖**严格单向**（外层 → 内层）：

```
entries  →  agent  →  infra  →  shared  →  packages/*（pi SDK）
```

### vivlos/ 目录结构

```
vivlos/
├── main.ts                  # 组合根：手动装配所有依赖，启动入口
├── types.ts                 # 全局公共契约
│
├── entries/                 # 入口层
│   ├── tui/                 # 终端 TUI（复用 packages/tui）
│   ├── qq/                  # QQ channel adapter
│   ├── wechat/              # 微信 channel adapter
│   └── types.ts             # ChannelAdapter 接口、统一消息格式
│
├── agent/                   # 核心引擎层
│   ├── loop/                # agent loop（封装 pi agentLoop + vivlos hook）
│   ├── tools/               # 工具注册表 + 调度（registry + toolset 分组）
│   ├── prompt/              # 系统提示构建器（动态拼装片段）
│   ├── memory/              # 当前 Session 的 L1 Memory 运行时
│   ├── session/             # 会话管理（封装 pi session repo）
│   ├── skills/              # skill 加载 + 注入
│   └── types.ts
│
├── infra/                   # 基础设施层
│   ├── llm/                 # LLM 对接（封装 pi-ai）
│   ├── storage/             # SQLite 持久化（session/cron/memory）
│   ├── sandbox/             # 容器沙箱隔离
│   ├── eventbus/            # 消息总线
│   ├── scheduler/           # Cron 调度器 + 持久化
│   ├── delegation/          # 子 agent 委派 + 并行管理
│   ├── credentials/         # API key 池 + 轮转
│   └── types.ts
│
└── shared/                  # 跨层共享（纯类型 + 工具函数，无副作用）
    ├── result.ts            # 复用 pi 的 Result<T,E>
    ├── errors.ts            # 错误类型层级
    ├── types.ts
    └── utils/
```

### 层职责

| 层 | 职责 | 可 import |
|---|---|---|
| **entries** | 把外部 channel 协议转成统一内部消息格式，不含业务逻辑 | agent, infra |
| **agent** | agent loop、工具调度、prompt 构建、memory、session、skills | infra, shared |
| **infra** | 基础设施实现：LLM、存储、沙箱、事件总线、调度、委派、凭据 | shared |
| **shared** | 纯类型 + 工具函数，无副作用，无状态 | 只 import packages/* 类型 |

### 依赖规则（强制）

1. 外层可 import 内层，**内层不可 import 外层**
2. `shared` 不 import vivlos 任何层（只 import `packages/*` 类型）
3. 跨层通信用**事件**（eventbus）或**显式参数传递**，不直接反向调用
4. 每个 package/层有 `types.ts`（公共契约）+ `index.ts`（barrel export）
5. 跨包用 `import type` 避免循环依赖

## 代码风格

- **函数式倾向**：优先函数 + 闭包，有状态才用 class
- **构造器函数返回 interface**（参考 pi 的 `createEventBus()` 模式，不写 `new XxxService()`）
- **组合根**：`main.ts` 手动装配依赖，不用 DI 框架
- **错误处理**：用 `Result<T, E>`（`shared/result.ts`），不到处 try/catch；预期失败返回 `err`，不抛
- **类型**：用 `import type`、`satisfies`、discriminated union；禁止 `any`，用 `unknown` + 类型守卫
- **命名**：camelCase 函数/变量，PascalCase 类型/interface
- **格式**：tab 缩进 + 分号（跟随 pi 风格）
- **每层 `types.ts`** 定义该层对外公共契约，`index.ts` 做 barrel 控制公开 API

## 构建与测试

```bash
npm run dev          # tsx 开发运行
npm test             # vitest --run 全量测试
npx tsc --noEmit     # 类型检查
```

## 环境依赖

### 必需

- [Bun](https://bun.sh/) 运行时
- `.env` 文件（参照 `.env.example`）：至少配置一个 LLM provider 的 API key

### 可选

- **tvly CLI**（Tavily）-- web 搜索/提取/爬取/研究 skill 依赖
  ```bash
  curl -fsSL https://cli.tavily.com/install.sh | bash
  tvly login --api-key tvly-YOUR_KEY   # 或在 .env 设 TAVILY_API_KEY
  ```
  获取 key：[tavily.com](https://tavily.com)

- 每个 package 有 `test/` 目录，测试文件命名 `*.test.ts`
- LLM 相关测试用 mock fixture，不打真实 API
- 待引入 `vitest-workspace` 统一管理多包测试

## pi SDK 关键 API（直接复用，不重造）

| 功能 | 位置 |
|---|---|
| agent loop | `packages/agent/src/agent-loop.ts` — `agentLoop()`, `runAgentLoop()` |
| Result 类型 | `packages/agent/src/harness/types.ts` — `Result<T,E>`, `ok`, `err`, `getOrThrow` |
| 事件总线（参考） | `packages/coding-agent/src/core/event-bus.ts` — `createEventBus()`，需提升到 `infra/eventbus` 并加类型化事件 |
| Session repo | `packages/agent/src/harness/session/` — jsonl / memory 两种实现 |
| 上下文压缩 | `packages/agent/src/harness/compaction/` — `compact()`, `shouldCompact()` |
| Skills 加载 | `packages/agent/src/harness/skills.ts` |
| System prompt 模板 | `packages/agent/src/harness/system-prompt.ts` |
| 工具类型 | `packages/agent/src/types.ts` — `AgentTool`, `AgentToolCall`, `ToolExecutionMode` |
| LLM 调用 | `@earendil-works/pi-ai` — `streamSimple()`, `Models`, `Context` |

## 建设里程碑（场景驱动，每步可运行）

- **M1**：终端 TUI 跑通完整对话（验证 LLM 对接 + session + eventbus + prompt 构建）
- **M2**：工具注册 + 调度（registry + toolset 分组）
- **M3**：跨会话 memory 持久化
- **M4**：Cron 调度 + 子 agent 委派 + 并行
- **M5**：多 channel adapter（QQ / 微信）
- **M6**：容器沙箱隔离

## 重要约定

- 改 `packages/`（pi SDK）前先确认——它是上游 SDK，尽量只在 `vivlos/` 里做封装
- 新功能先在 `vivlos/` 落地，通过封装 pi 能力实现
- 不确定的设计先 spike 验证，再正式落地
- 每个里程碑产出可运行可验证的成果，不留半成品
