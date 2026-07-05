# vivlos 开发路线图

> 当前分支：`vivlos-new-structure`
> 实验性功能分支前缀：`feature/`

## 阶段总览

| 阶段   | 目标                                | 预计提交 | 状态 |
| ------ | ----------------------------------- | -------- | ---- |
| **P0** | 项目工程基础                        | 1        | ⬜   |
| **P1** | shared 层 + Result 类型             | 1-2      | ⬜   |
| **P2** | infra 事件总线 + LLM 对接           | 2-3      | ⬜   |
| **P3** | agent 核心：prompt + session + loop | 2-3      | ⬜   |
| **P4** | TUI 入口跑通完整对话（M1 里程碑）   | 1-2      | ⬜   |
| **P5** | 工具注册 + 调度                     | 2        | ⬜   |
| **P6** | 跨会话 memory 持久化                | 2        | ⬜   |
| **P7** | Cron 调度 + 子 agent 委派           | 3+       | ⬜   |

---

## P0：项目工程基础

**文件清单**：

- [x] 改 `package.json`（dev → vivlos/main.ts、engines、typecheck、private）
- [x] 改 `tsconfig.json`（paths @vivlos/\*、include vivlos、exclude packages）
- [x] 新建 `vitest.config.ts`（只扫 vivlos/\*_/_.test.ts）
- [x] 新建 `vivlos/tsconfig.json`（extends 根配置）
- [x] 新建 `vivlos/main.ts`（dotenv + main 骨架）
- [x] 新建 11 个 barrel `index.ts`（shared → entries 各层）

**barrel 文件列表**：

- [x] `vivlos/shared/index.ts`
- [x] `vivlos/shared/utils/index.ts`
- [x] `vivlos/infra/index.ts`
- [x] `vivlos/infra/llm/index.ts`
- [x] `vivlos/infra/eventbus/index.ts`
- [x] `vivlos/infra/storage/index.ts`
- [x] `vivlos/agent/index.ts`
- [x] `vivlos/agent/loop/index.ts`
- [x] `vivlos/agent/tools/index.ts`
- [x] `vivlos/agent/prompt/index.ts`
- [x] `vivlos/entries/index.ts`

**验证**：`npm run dev` 打印成功 / `npm run typecheck` 无报错 / `npm test` 不跑 pi 测试

---

## P1：shared 层

**文件清单**：

- [x] `vivlos/shared/result.ts` — `Result<T,E>`、`ok()`、`err()`
- [x] `vivlos/shared/errors.ts` — 错误类型层级（VivlosError 基类 + 子类）
- [x] `vivlos/shared/types.ts` — 公共类型（AgentConfig、TokenUsage 等）
- [x] `vivlos/shared/utils/id.ts` — ID 生成器
- [x] `vivlos/shared/utils/time.ts` — 时间工具
- [x] 各文件对应 `*.test.ts`

**验证**：`npm test` 通过 / `@vivlos/shared` import 可用

---

## P2：infra 事件总线 + LLM 对接

### P2a 事件总线

- [x] `vivlos/infra/eventbus/types.ts` — 类型化事件定义（VivlosEvent）
- [x] `vivlos/infra/eventbus/index.ts` — `createEventBus()` 实现
- [x] 测试（emit/on/clear/错误隔离/取消订阅）

### P2b LLM 对接

- [x] `vivlos/infra/llm/types.ts` — LLM 契约类型
- [x] `vivlos/infra/llm/provider.ts` — 封装 pi-ai 模型发现
- [x] `vivlos/infra/llm/index.ts` — barrel
- [x] 测试（mock streamSimple）

**验证**：`npm test` 通过 / eventbus 可独立使用 / LLM 封装调用成功

---

## P3：agent 核心

**文件清单**：

- [x] `vivlos/agent/types.ts` — agent 层公共契约
- [x] `vivlos/agent/session/` — 封装 pi session repo（memory-repo 起步）
- [x] `vivlos/agent/prompt/` — prompt builder（身份/环境/memory/skills 拼装）
- [x] `vivlos/agent/loop/` — 封装 pi agentLoop（注入 eventbus + prompt + session）
- [x] `vivlos/agent/index.ts` — barrel
- [x] 各模块测试（mock LLM 验证 loop 跑通一轮）

**验证**：mock LLM 下 agent loop 能跑一轮完整对话（user → assistant text → done）

---

## P4：TUI 入口（M1 里程碑 🎯）

**文件清单**：

- [ ] `vivlos/entries/types.ts` — ChannelAdapter 接口、统一消息格式
- [ ] `vivlos/entries/tui/` — 最小 TUI（输入框 + 流式输出渲染，复用 packages/tui）
- [ ] `vivlos/main.ts` 改写成组合根（装配所有依赖）

**验证**：`npm run dev` → 输入文字 → 看到 LLM 流式回复

---

## P5：工具注册 + 调度

**文件清单**：

- [ ] `vivlos/agent/tools/types.ts` — VivlosTool 接口
- [ ] `vivlos/agent/tools/registry.ts` — 工具注册表（register/list/get）
- [ ] `vivlos/agent/tools/index.ts` — barrel
- [ ] 实现 3 个基础工具：read_file / write_file / run_bash
- [ ] 工具注入 agent loop
- [ ] 测试（mock 工具验证 tool_call 流程）

**验证**：agent 能调用工具并得到结果

---

## P6：Memory 持久化

**文件清单**：

- [ ] `vivlos/infra/storage/` — SQLite 存储层（better-sqlite3）
- [ ] `vivlos/agent/memory/` — memory 管理器（读写/注入 prompt）
- [ ] 改造 session 用 SQLite 持久化
- [ ] 测试

**验证**：重启后记忆保留 / 新对话自动注入内存

---

## P7：Cron + 子 agent 委派（实验分支 `feature/cron-and-delegation`）

**文件清单**：

- [ ] `vivlos/infra/scheduler/` — cron 调度器 + job 持久化
- [ ] `vivlos/infra/delegation/` — 子 agent spawn + 并行 + 深度限制
- [ ] 测试通过后合并回 `vivlos-new-structure`

**验证**：定时任务触发 / 并行子 agent 跑完回流

---

## 实验分支约定

遇到以下类型功能，从当前分支切出新分支开发：

- Cron 调度（P7）
- 子 agent 委派 + 并行（P7）
- 沙箱隔离（P6 后）
- 新 channel adapter（P4 后，如 QQ/微信）

分支命名：`feature/<功能名>`，测试通过后 `git merge` 回 `vivlos-new-structure`。

---

## 提交规范

```
type: 简短描述

可选详细说明
```

类型：`chore`（工程）、`feat`（功能）、`fix`（修复）、`refactor`（重构）、`docs`（文档）、`test`（测试）

每完成 1-2 个阶段内的子任务提交一次。
