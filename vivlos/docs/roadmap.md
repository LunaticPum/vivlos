# vivlos 开发路线图

> 当前分支：`vivlos-new-structure`
> 实验性功能分支前缀：`feature/`
> 参照项目：Hermes Agent（Nous Research）

## 阶段总览

| 阶段   | 目标                                | 状态 |
| ------ | ----------------------------------- | ---- |
| **P0** | 项目工程基础                        | ✅   |
| **P1** | shared 层 + Result 类型             | ✅   |
| **P2** | infra 事件总线 + LLM 对接           | ✅   |
| **P3** | agent 核心：prompt + session + loop | ✅   |
| **P4** | TUI 入口跑通完整对话（M1 里程碑）   | ✅   |
| **P5** | 工具注册 + 6 个内置工具 + TUI 渲染  | ✅   |
| **P6** | 跨会话 memory 持久化                | ⬜   |
| **P7** | Cron 调度 + 子 agent 委派           | ⬜   |

---

## ✅ 已完成阶段

### P0：项目工程基础

- [x] 改 `package.json`（dev → vivlos/main.ts、engines、typecheck、private）
- [x] 改 `tsconfig.json`（paths @vivlos/\*、include vivlos、exclude packages）
- [x] 新建 `vitest.config.ts`（只扫 vivlos/\*/\*.test.ts）
- [x] 新建 11 个 barrel `index.ts`（shared → entries 各层）
- [x] AGENTS.md 项目规范

**验证**：`npm run dev` 打印成功 / `npm run typecheck` 无报错

---

### P1：shared 层

- [x] `vivlos/shared/result.ts` — `Result<T,E>`、`ok()`、`err()`、`getOrThrow()`
- [x] `vivlos/shared/errors.ts` — VivlosError 基类 + ConfigError / LLMError / ToolError / SessionError
- [x] `vivlos/shared/types.ts` — AgentConfig、TokenUsage、ChannelMessage
- [x] `vivlos/shared/utils/id.ts` — shortId / uid
- [x] `vivlos/shared/utils/time.ts` — 时间工具
- [x] 30 个测试

---

### P2：infra 事件总线 + LLM 对接

- [x] `vivlos/infra/eventbus/` — VivlosEvent discriminated union（agent/text/tool/log）、createEventBus、错误隔离
- [x] `vivlos/infra/llm/` — LLMClient 接口、createLLM（封装 pi-ai builtinModels）、loadLLMConfigFromEnv
- [x] 10 个测试

---

### P3：agent 核心

- [x] `vivlos/agent/types.ts` — VivlosAgent / VivlosLoopConfig / VivlosLoopResult 契约
- [x] `vivlos/agent/prompt/` — PromptBuilder（identity/environment/rules/memory/skills 拼装）
- [x] `vivlos/agent/session/` — VivlosSession + createMemorySession（内存实现，P6 接持久化）
- [x] `vivlos/agent/loop/` — createAgentLoop（封装 pi agentLoop()，AgentEvent → VivlosEvent 映射）
- [x] `vivlos/agent/loop/hooks/` — VivlosLoopHooks + createMaxTurnsHook 工厂
- [x] 12 个测试

---

### P4：TUI 入口（M1 里程碑 🎯）

- [x] `vivlos/entries/types.ts` — ChannelAdapter 接口、ChannelMessage 统一格式
- [x] `vivlos/entries/tui/containers/` — chat / input / status 三个容器
- [x] `vivlos/entries/tui/index.ts` — createTuiApp（组装 pi-tui + EventBus 绑定）
- [x] `vivlos/main.ts` — 组合根：装配 LLMClient + EventBus + Agent + TUI
- [x] `vivlos/entries/tui/components/agent-status-border.ts` — AgentStatusBorder 组件
  - 双层边框：外层 vivlos header + 内层推理过程 box
  - ReAct 顺序的 think→tool→think 流程可视化
  - thinking 内容 Markdown 渲染（缓存复用，支持粗体/斜体/代码块）
  - tool 调用摘要+结果展示，续行标记 `╰─> ` / `  ┆ `
  - 完成后自动折叠为摘要行（turn/tool 计数 + 耗时）
  - `/detail` 切换折叠/展开
- [x] Markdown 渲染增强
  - h3+ 标题 `### ` 前缀自动剥离
  - 行内代码 `` `xxx` `` 青色（`FG.cyan`）
  - 代码块内容绿色（`FG.green`），围栏灰色（`FG.gray`）
  - 分隔符宽度适配 CJK 终端（`─` ambiguous width）
- [x] tsconfig.json 加 @earendil-works/\* paths → packages/\*/src

**验证**：`npm run dev` → 输入文字 → deepseek-v4-flash 流式回复 ✅

---

### P5：工具注册 + 调度

- [x] `vivlos/agent/tools/registry.ts` — createToolRegistry（register/list/get）
- [x] `vivlos/agent/tools/builtin/` — read / write / bash / ls / grep / find 六个工具
- [x] `vivlos/entries/tui/containers/tool.ts` — ToolExecution 组件
- [x] agent-loop → AgentContext.tools 注入，pi loop 自动处理 tool calling
- [x] TUI tool:call_start / tool:call_end 事件绑定

**验证**：`npm run dev` → agent 能调用工具并得到结果

---

## 🔜 下一阶段

### P6：Memory 持久化

**参照**：Hermes 的 memory 系统（`memory` tool、MEMORY.md / USER.md、pluggable backends）

**文件清单**：

- [ ] `vivlos/infra/storage/` — SQLite 存储层（better-sqlite3）
- [ ] `vivlos/agent/memory/` — memory 管理器
  - 读写持久化 memory
  - 注入 prompt（类似 Hermes 的 \`\`\` 块）
  - 自动精简/去重策略
- [ ] 改造 session 用 SQLite 持久化（接 pi SessionRepo）
- [ ] 参考 Hermes 的 MEMORY.md / USER.md 双存储模型

**验证**：重启后记忆保留 / 新对话自动注入记忆

---

### P7：Cron 调度 + 子 agent 委派（实验分支 `feature/cron-and-delegation`）

**参照**：Hermes 的 cron + delegation 系统

**Cron 部分**：
- [ ] `vivlos/infra/scheduler/` — cron 表达式解析 + job 持久化 + 调度循环
- [ ] 支持定时触发 agent 对话（参照 Hermes cronjob 工具: create/list/pause/resume/remove）
- [ ] job 失败重试 + 超时处理

**子 agent 委派部分**：
- [ ] `vivlos/infra/delegation/` — 子 agent spawn + 并行 + 深度限制
- [ ] context 隔离 + 结果回流（参照 Hermes delegate_task 工具）
- [ ] 测试通过后合并回 `vivlos-new-structure`

**验证**：定时任务触发 / 并行子 agent 跑完回流

---

## 📋 后续核心功能（必做）

### S1：TUI 体验持续优化

- [ ] 聊天历史滚动（PageUp/PageDown）
- [ ] 多行输入 + 输入历史（上/下箭头翻历史）
- [ ] 自动补全（slash command、文件路径）
- [ ] Ctrl+C / Ctrl+D 优雅退出
- [ ] 主题/配色支持（暗色/亮色切换）
- [ ] header 区域（标题栏、模型名、版本号）
- [ ] footer 区域（快捷键提示、token 计数）

---

### S2：代码结构全优化

**目标**：清理当前冗余、统一风格、提升可维护性

- [ ] 去除不用的 barrel 文件、dead code
- [ ] 统一 import 风格（`import type` vs `import`、`.ts` 后缀一致性）
- [ ] 表达式统一（`readonly` 修饰、函数声明风格、interface vs type）
- [ ] shared/types.ts 里的旧定义清理/整合
- [ ] 提取公共重复逻辑到 shared/utils
- [ ] 整体 review + 补全 TODO

---

### S3：多聊天渠道适配

- [ ] `vivlos/entries/adapters/` — 渠道适配器接口 + 注册
- [ ] TUI adapter 重构为 ChannelAdapter 实现
- [ ] 后续：HTTP API / WebSocket / Telegram Bot 等渠道接入

---

### S4：Skills 系统

- [ ] Skill 类型定义（name / description / content / filePath）
- [ ] skill loader（从文件系统加载 SKILL.md）
- [ ] skill 注入 prompt builder
- [ ] `/skill <name>` slash command
- [ ] skill 管理（安装/卸载/更新）

---

### S5：任务编排与工作流设计

- [ ] Task 类型定义（title/status/assignee/context）
- [ ] 任务生命周期管理（create/assign/complete/fail）
- [ ] 多步骤工作流编排（DAG 依赖）
- [ ] 人工介入点（approval gate）

---

## 💡 视情况扩展功能

### E1：场景 Demo——定时资讯简报
- 依赖：P7 Cron + S3 多渠道

### E2：场景 Demo——自动化开发助手
- 依赖：P7 子 agent 委派 + S5 任务编排

### E3：多智能体协作
- 依赖：P7 + S5

### E4：工具生态扩展
- 更多内置工具、第三方插件机制、权限控制

### E5：在线持久化
- session 云端同步、memory 跨设备同步

### E6：发布与分发
- CLI 打包、npm 发布、配置向导

---

## 提交规范

```
type: 简短描述

可选详细说明
```

类型：`chore`（工程）、`feat`（功能）、`fix`（修复）、`refactor`（重构）、`docs`（文档）、`test`（测试）

每完成 1-2 个阶段内的子任务提交一次。
