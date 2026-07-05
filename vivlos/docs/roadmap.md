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
- [x] `vivlos/entries/tui/containers/` — chat / input / status 三个容器（各留有 TODO 标注扩展方向）
- [x] `vivlos/entries/tui/index.ts` — createTuiApp（组装 pi-tui + EventBus 绑定）
- [x] `vivlos/main.ts` — 组合根：装配 LLMClient + EventBus + Agent + TUI
- [x] tsconfig.json 加 @earendil-works/\* paths → pakcages/\*/src

**验证**：`npm run dev` → 输入文字 → deepseek-v4-flash 流式回复 ✅

---

### P5：工具注册 + 调度

- [x] `vivlos/agent/tools/registry.ts` — createToolRegistry（register/list/get）
- [x] `vivlos/agent/tools/builtin/` — read / write / bash / ls / grep / find 六个工具
- [x] `vivlos/entries/tui/containers/tool.ts` — ToolExecution 组件（P5 最小版，单行 Text √/✗）
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

### S1：TUI 体验全面升级

**参照**：Hermes TUI (tui.ts + components/) + coding-agent interactive-mode

- [ ] 聊天历史滚动（PageUp/PageDown）
- [ ] user/assistant/tool 消息差异样式（缩进、颜色、前缀标记）
- [ ] Markdown 渲染（替换 Text 为 Markdown 组件，代码高亮）
- [ ] ToolExecution 组件完善——Box 边框/背景色、展开/折叠、流式中间态更新
- [ ] header 区域（标题栏、模型名、版本号）
- [ ] footer 区域（快捷键提示、token 计数）
- [ ] 主题/配色支持（暗色/亮色切换，参照 coding-agent ThemeController）
- [ ] 多行输入 + 输入历史（上/下箭头翻历史）
- [ ] 自动补全（slash command、文件路径）
- [ ] Ctrl+C / Ctrl+D 优雅退出

---

### S2：代码结构全优化

**目标**：清理当前冗余、统一风格、提升可维护性

- [ ] 去除不用的 barrel 文件、dead code（VivlosAgentContext 等）
- [ ] 统一 import 风格（`import type` vs `import`、`.ts` 后缀一致性）
- [ ] 表达式统一（`readonly` 修饰、函数声明风格、interface vs type）
- [ ] shared/types.ts 里的旧定义清理/整合
- [ ] 提取公共重复逻辑（如 MAX_CHARS 截断到 shared/utils）
- [ ] 整体 review + 补全 TODO

---

### S3：多聊天渠道适配

**参照**：Hermes 的 gateway 架构（20+ 平台适配器）

- [ ] `vivlos/entries/adapters/` — 渠道适配器接口 + 注册
- [ ] TUI adapter 重构为 ChannelAdapter 实现
- [ ] 后续：HTTP API / WebSocket / Telegram Bot 等渠道接入
- [ ] 统一 ChannelAdapter 接口：所有渠道的输入 → ChannelMessage → agent.prompt() 统一管道

---

### S4：Skills 系统

**参照**：Hermes 的 skills 系统（SKILL.md + 动态加载 + curator）

- [ ] Skill 类型定义（name / description / content / filePath）
- [ ] skill loader（从文件系统加载 SKILL.md）
- [ ] skill 注入 prompt builder（参照 Hermes `<available_skills>` XML 块）
- [ ] `/skill <name>` slash command
- [ ] skill 管理（安装/卸载/更新，参照 Hermes skills CLI）

---

### S5：任务编排与工作流设计

**参照**：Hermes 的 Kanban + Workflow 系统

- [ ] Task 类型定义（title/status/assignee/context）
- [ ] 任务生命周期管理（create/assign/complete/fail）
- [ ] 多步骤工作流编排（DAG 依赖）
- [ ] 人工介入点（approval gate）

---

## 💡 视情况扩展功能

### E1：场景 Demo——定时资讯简报

**依赖**：P7 Cron + S3 多渠道

- [ ] 定时任务：每天早上 8:00 拉取指定 RSS/API 资讯
- [ ] agent 自动摘要 + 格式化
- [ ] 通过 Telegram/Email 等渠道推送（需先完成 S3）

---

### E2：场景 Demo——自动化开发助手

**依赖**：P7 子 agent 委派 + S5 任务编排

- [ ] 用户描述需求 → agent 拆解为子任务（read code → write → test → commit）
- [ ] 多个子 agent 并行执行不同子任务
- [ ] 结果汇总 + 用户确认

---

### E3：多智能体协作

**参照**：Hermes 的 Kanban（multi-profile worker dispatch）

- [ ] 多个 vivlos 实例（不同模型/不同系统提示词）协作完成复杂任务
- [ ] 任务分派（dispatch + claim）
- [ ] 角色分工（planner / coder / reviewer / tester）

---

### E4：工具生态扩展

- [ ] 更多内置工具（edit diff、web search、browser、git 操作）
- [ ] 第三方工具插件机制
- [ ] 工具权限控制（readonly mode / approve before execute）

---

### E5：在线持久化

- [ ] session 云端同步
- [ ] memory 跨设备同步
- [ ] agent 状态备份/恢复

---

### E6：发布与分发

- [ ] CLI 打包（pkg / ncc）
- [ ] npm 包发布
- [ ] 配置向导（hermes setup 风格）

---

## 提交规范

```
type: 简短描述

可选详细说明
```

类型：`chore`（工程）、`feat`（功能）、`fix`（修复）、`refactor`（重构）、`docs`（文档）、`test`（测试）

每完成 1-2 个阶段内的子任务提交一次。
