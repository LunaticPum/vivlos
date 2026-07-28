# Memory Refactor 协作与恢复规格

> 上下文压缩或新 Agent 接手后，先完整阅读本文，再读取 `vivlos/agent/memory-refactor/docs/refactor.md` 和当前领域文件。不要从旧 `vivlos/agent/memory/` 推断新实现。

## 1. 当前恢复点

- 日期：2026-07-28。
- 仓库：`D:\VSProject\Agent\my_agent`。
- 当前分支：`memory-refactor`。
- Memory 领域 0-5 已提交：`61acd47 feat: 完成 Memory 巩固触发与运行时`。
- Memory 核心运行闭环已提交：`c201b4a feat: 完成 Memory 核心运行闭环`。
- 会话 Workspace、Sidebar、自动标题和 EventBus 拆分已提交：`6a30123 feat: 完善会话工作区与事件架构`。
- 新实现位于 `vivlos/agent/memory-refactor/`；当前基线包含 Repository、Logic、Security、Service、Tools、History/Trigger、Consolidator Runtime、L1 renderer 和 session MemoryRuntime。
- **任务二：Consolidate 生命周期事件** 和 **任务三：Tool 调用展示优化** 已完成，将随 `feat: 接通巩固事件与工具展示` 提交。
- 下一领域为 L1 空文件与 Sidebar 真实 Overview 接入，当前尚未开始。

最近一次验证：

```text
bun test          -> 155 pass, 0 fail, 13 files
bun run typecheck -> passed
git diff --check  -> passed（仅有 LF/CRLF 提示）
```

## 2. 必须遵守的协作流程

用户要求按领域逐步推进，不允许一次展开全部实现：

1. 先定义大领域和顺序。
2. 开始某个领域前，只展开该领域的详细 Todo。
3. 用户 review Todo 并明确同意后，才执行代码。
4. 用户可能只批准 Todo 的一部分；严格停在指定编号。
5. 写完该部分后停下，交给用户 review，不自动进入下一部分。
6. 领域完成且用户确认后，从 Todo 中移除该领域明细，再规划下一个领域。
7. **编写任何测试脚本前，必须先创建或更新对应测试文档。**
8. 测试文档 review 通过后，才写测试脚本。

实践经验：

- 不要在设计 review 前实现代码。此前曾过早实现复杂 `consolidateEntries()`，后来整体删除。
- 不要为了完成一个 Todo 暴露不可用的半成品 API，例如只支持 noop 或只会抛错的 factory。
- 如果 Todo 之间存在不可分割依赖，先说明并调整边界，不要静默扩大实现范围。
- 用户重视模块平行、命名直观和代码阅读顺序，优先保持结构对称。
- 命名保持简洁并利用所在模块的上下文，不刻意堆叠长前缀；同时避免难懂缩写。
- 底层 error/warn 不要只 throw；优先返回结构化状态并调用 `infra/logger`，需要用户感知时设置 `onTui=true`。不建立复杂错误系统。
- 不要将未来可能需要的复杂机制提前加入当前简单需求。

## 3. 产品级约定

### 3.1 当前只实现 Session-local L1

每个 session 独立拥有：

```text
.vivlos/sessions/<timestamp>_<sessionId>/
├── history.jsonl
├── memory.md
├── user.md
└── memory-events.jsonl
```

- `memory.md`：项目、环境、决策和长期事实。
- `user.md`：用户偏好、画像和沟通方式。
- 新 session 不自动加载其他 session 的 L1。
- 文件懒创建；首次有效写入才创建。
- L2-L4 不在当前范围，不预留复杂 Provider 框架。

### 3.2 实际变化后立即刷新 SP

```text
Memory 写盘成功
-> revision 实际变化
-> 发布 memory:changed
-> 当前 session SP 失效
-> 下一次 LLM 推理前重建 L1 SP
```

- noop/rejected/失败不刷新。
- 删除最后一条使文件变空仍属于实际变化。
- 最终 changed 必须以 Repository 返回的 revision 是否变化为准，而不是只相信 Logic 声明。

## 4. 主模型与 Consolidator 的责任边界

核心原则：

```text
主模型决定“记什么”
Consolidator 优化“怎么存”
```

主模型是内容权威：

- `add`：保存新事实。
- `replace`：根据用户纠正更新事实片段。
- `remove`：根据用户要求遗忘事实。

Consolidator 只是低频 L1 维护器：

- `refine`：压缩或澄清一个完整 entry。
- `merge`：合并同一文件中的多个完整 entries。

Consolidator 禁止：

- add/replace/remove。
- 推断新事实或用户偏好。
- 纠正事实、判断事实过时、恢复已删除内容。
- 改变 entry 的 memory/user 归属。
- 根据常识扩写或覆盖主模型最近操作。

没有可安全整理的内容时，Consolidator 不调用工具并结束；不存在 noop action，noop 只是操作 outcome。

## 5. 被否决的巩固设计

不要恢复以下方案，除非用户未来明确改变需求：

- `ConsolidationPlan`。
- 独立 `ConsolidationValidator`。
- evidenceEventIds/baseRevision/consolidationId/receipt/planHash。
- 跨 memory/user 的 `applyBatch()` 或批量事务。
- 巩固 add/noop。
- 多操作原子回滚。
- 单 entries 批处理 `consolidateEntries()`。
- 批末隐式 `Set` 去重。

这些机制曾用于“证据支持的新事实、跨文件原子批次、幂等恢复”等更大需求，但当前需求只是模型触发后连续执行独立 refine/merge，因此属于过度设计。

当前语义是：每个 refine/merge 独立读取最新 snapshot、独立提交；前一个成功而后一个失败时，前一个结果保留。

## 6. 当前目标目录

```text
vivlos/agent/memory-refactor/
├── refactor.md
├── index.ts                    # 最后阶段创建/收敛
├── types.ts
├── security.ts
├── memory.ts
├── consolidate.ts
├── service.ts
├── consolidator/               # 后续领域
│   ├── prompt.ts
│   ├── trigger.ts
│   └── runner.ts
├── layers/
│   └── l1.ts
└── utils/
    └── event-logger.ts

vivlos/infra/storage/memory/
├── index.ts
├── repository.ts
└── history.ts                  # 操作留痕领域再设计

vivlos/agent/tools/advanced/memory/
├── memory.ts
├── consolidate.ts
└── description.ts
```

当前已存在 Consolidate Tool、`consolidator/prompt.ts`、`trigger.ts`、`runner.ts`、L1 renderer、session Runtime 和公共 `index.ts`。

## 7. 模块平行规则

用户明确要求 `memory.ts` 与 `consolidate.ts` 看起来平行：

```text
memory.ts
├── 主动记忆命令
├── 领域结果
├── 统一入口 applyMainCommand
├── Add / Replace / Remove
└── 唯一匹配

consolidate.ts
├── 记忆巩固命令
├── 领域结果
├── 统一入口 applyConsolidationCommand
├── Refine / Merge
└── 精确匹配
```

- `MainMemoryCommand` 必须定义在 `memory.ts`。
- `ConsolidationMemoryCommand` 必须定义在 `consolidate.ts`。
- `service.ts` 导入两个 command 和两个 apply 入口，不重新定义或实现领域 dispatcher。
- Event ID 使用 `@vivlos/shared` 的 `uid()`，不要直接使用 `randomUUID()`。
- 中文注释要解释边界；文件使用 `// #region xxx` 组织。

## 8. 主动记忆 Logic

文件：`vivlos/agent/memory-refactor/memory.ts`。

公开内容：

- `MainMemoryCommand`。
- `MemoryLogicValue/Error/Result`。
- `applyMainCommand()`。
- `addEntry()`、`replaceEntry()`、`removeEntry()`。

共同规则：

- 输入参数在入口 trim。
- 不读取文件、不扫描 Security、不检查 cap、不发 Event。
- 不修改输入 entries。
- committed 返回新数组；noop 返回原数组引用；error 不返回部分状态。

Add：

- 空 content -> `invalid_input`。
- 精确重复 -> noop。
- 其他 -> 末尾追加。

Replace/Remove 的 `findUniqueMatch()`：

- 在所有 entry 文本内部定位 oldText **局部子串**。
- 返回 `entryIndex + offset`。
- 0 次 -> `not_found`。
- 超过 1 次 -> `ambiguous_match`。
- 同一 entry 内重复或重叠出现也算 ambiguous。
- Replace 最终目标若等于另一现有 entry：移除旧 entry，保留已有目标。
- Remove 删除命中子串所在的完整 entry。

## 9. 巩固 Logic

文件：`vivlos/agent/memory-refactor/consolidate.ts`。

公开内容：

- `RefineCommand`、`MergeCommand`、`ConsolidationCommand`、`ConsolidationMemoryCommand`。
- `ConsolidationLogicValue/Error/Result`。
- `applyConsolidationCommand()`。

`findExactSource()` 与主动匹配不同：

- 使用完整字符串相等定位一个 source entry。
- 不做子串匹配，不返回 offset。
- 完整 source 出现 0 次 -> `not_found`。
- 完整 source 出现多次 -> `ambiguous_match`。
- Exact source 也是轻量 stale guard：主模型已修改 entry 时，旧巩固操作应失败而非覆盖新状态。

Refine：

- oldEntry/newEntry trim 后不能为空。
- oldEntry 必须精确且唯一。
- 内容相同 -> noop 和原 entries 引用。
- newEntry 已存在于其他 entry -> `duplicate_target`。
- `newEntry.length > oldEntry.length` -> `not_reduced`。
- 允许等长措辞整理；成功在原位置替换。

Merge：

- oldEntries 至少 2 条，trim 后非空且互不重复。
- 每个 source 必须精确且唯一。
- newEntry 已存在于未参与 entry -> `duplicate_target`。
- `newEntry.length >= sources 内容长度总和` -> `not_reduced`。
- newEntry 可以等于某个 source，只要合并后确实压缩其他 source。
- before 按当前文件顺序记录，不按命令参数顺序。
- newEntry 放在最早 source 位置，未引用 entries 保持原值和相对顺序。

代码无法证明自然语言“事实并集不丢失”，该责任由后续 Consolidator Prompt 约束。

## 10. Security

文件：`vivlos/agent/memory-refactor/security.ts`。

无状态纯函数：

- `scanContent()`：扫描最终完整候选。
- `checkPermission()`：actor/action 白名单。
- `escapeForPrompt()`：XML 文本结构转义。

扫描类别：

- Markdown `---` 分隔符注入。
- Prompt injection。
- 模型角色/控制标记。
- API Key、密码、私钥、token。
- 不可见 Unicode/方向控制字符。

权限矩阵：

```text
main         -> add / replace / remove
consolidator -> refine / merge
```

`MEMORY_ACTIONS` 当前只有 add/replace/remove/merge/refine；noop 已移除。

## 11. Repository 与 Event

Repository：`vivlos/infra/storage/memory/repository.ts`。

- 绑定单个 sessionDir。
- `readSnapshot()` 同时返回 memory/user entries、usage 和 combined SHA-256 revision。
- `write(file, entries)` 只写一个文件。
- 格式：entry 间 `\n---\n`，非空文件结尾一个 `\n`，空文件真正为空。
- 读取兼容 LF/CRLF。
- 写前规范化、分隔符检查、cap 检查。
- expected business failure 使用 Result；文件系统 I/O 可抛出。

EventBus 当前两类事件：

- `memory:operation`：每个 committed/noop/rejected 终态。
- `memory:changed`：只在实际 revision 改变时。

`MemoryOperationEvent` 已增加可选 `beforeEntries`，用于 merge 多 source 留痕。Rejected Event 不得包含 before/beforeEntries/after 或不安全候选。

Event Logger：`utils/event-logger.ts`。

- best-effort 订阅 operation 并追加 session `memory-events.jsonl`。
- 写日志失败不回滚成功 Markdown，不改变 Tool Result。
- Event 不是当前 Memory 状态源；Markdown 才是。

## 12. Memory Service

文件：`vivlos/agent/memory-refactor/service.ts`。

公开契约：

- `MemoryOperationContext`：sessionId、reasonCode、可选 reason/source。
- `MemoryServiceValue/Error/Result`。
- `MemoryService`。
- `MemoryServiceDependencies`。
- `createMemoryService()`。

两个强类型入口：

```text
executeMain(MainMemoryCommand, context)
executeConsolidation(ConsolidationMemoryCommand, context)
```

共同链路：

```text
读取最新 snapshot
-> checkPermission
-> 对应 apply 纯 Logic
-> Logic error: rejected
-> noop: 不扫描、不写盘，发布 operation(noop)
-> changed: scanContent(final after)
-> Security error: rejected
-> Repository.write(single file)
-> Repository Result error: rejected
-> 根据实际 revision 生成 committed/noop
-> 发布 operation
-> 只有 actual changed 才发布 memory:changed
```

结果约定：

- `MemoryServiceValue` 是判别联合，只允许 `committed/true` 或 `noop/false`。
- 成功包含 actor/action/file、before 或 beforeEntries、after、最新 usage、revisionBefore/After。
- 预期失败包含 code/message、actor/action/file、当前 usage、相同 revisionBefore/After，可选 violations。
- Security rejected 的 Event 和 error 不携带候选原文。
- read/write I/O 抛错不 catch，不伪装成业务 rejected。
- 前序独立操作成功、后序失败时不回滚前序操作。

实现细节约束：

- Service 不实现领域 dispatcher；导入 `applyMainCommand` 与 `applyConsolidationCommand`。
- Service 不直接访问 node:fs/path、PromptBuilder、Tool、Agent Loop。
- Event ID 统一调用 shared `uid()`。

## 13. History、Trigger 与 Runtime

### 13.1 History 与 Cursor

文件：`vivlos/infra/storage/memory/history.ts`。

- `createHistory(sessionDir, sessionId)` 返回绑定 session 的 History。
- `read(after)` 按 `memory-events.jsonl` 物理行读取，返回 `records/issues/tail`。
- 只投影 main add/replace/remove；Consolidator 记录验证后忽略。
- issue 只有 `line+code`，不含坏行、错 session 或候选原文。
- rejected 记录强制丢弃 before/after。
- `readCursor()/saveCursor(line)` 管理单一 `memory-cursor.json`。
- Cursor 格式只有单行 `{ "line": number }`；缺失为 0，禁止回退/越过 tail，临时文件原子替换。
- History 是 best-effort 整理参考，Markdown 始终是当前状态源。

### 13.2 Trigger

文件：`vivlos/agent/memory-refactor/consolidator/trigger.ts`。

- `checkTrigger(input)` 是无 I/O 纯函数。
- 优先级：`main_request > capacity_pressure > operation_threshold`。
- 默认 20 次 main committed 或容量比例 0.85；可配置。
- noop/rejected 不累计；空 L1 不触发。
- 容量触发要求至少一条新的有效主模型 record，防止固定高容量反复运行。
- Decision 包含 reason、cursor/tail、安全 records、usage 和受压 files；不推进 cursor。

### 13.3 Config 与模型解析

`MemoryConfig.consolidator`：

```text
model: { provider, id } | null
trigger: { operations: 20, capacity: 0.85 }
maxTurns: 6
maxTools: 8
timeoutMs: 60000
```

- Config 在 `vivlos/infra/config/index.ts` 做默认值、深层合并和基础范围校验。
- model 缺失/null 表示每次运行使用当时当前主模型，不固定启动默认模型。
- `ModelRef` 位于 `infra/llm/types.ts`，不包含 key/baseUrl。
- `infra/llm.resolveModel(llm, ref, current)`：null 返回 current；显式引用精确查找。
- 显式模型不存在返回 `model_not_found` Result，调用 logger/TUI，不静默回退。
- Config/模型解析由后续组合根调用；Runner 不读取 `.env`、config 或 CredentialStore。

### 13.4 Prompt

文件：`vivlos/agent/memory-refactor/consolidator/prompt.ts`。

- `SYSTEM_PROMPT` 固定主模型内容权威和 Consolidator 只优化表达的边界。
- `buildPrompt({ snapshot, decision })` 返回 system/user。
- 动态输入只有最新 entries/usage 和安全 decision/history。
- 所有动态字符串进入 XML 文本节点并调用 `escapeForPrompt()`；属性仅枚举/数字。
- 不包含完整 session、source 消息、History issue、主 Tool Result、rejected 候选或 Provider 信息。
- History 只是参考，不能恢复 remove/rejected/before 中当前 entries 不存在的事实。

### 13.5 Runner

文件：`vivlos/agent/memory-refactor/consolidator/runner.ts`。

- `createRunner(deps)` 使用底层 pi `agentLoop()`，不复用主 Agent wrapper。
- `run()` 每次接收 resolved Model、Decision、sessionId 和可选 signal，并重读最新 snapshot。
- AgentContext 只有专用 Prompt 和唯一 consolidate Tool；`toolExecution="sequential"`。
- 默认限制来自 Config：6 turns、8 次实际 Tool 调用、60 秒 timeout。
- 允许零次或多次独立 refine/merge；前序成功不因后序失败回滚。
- single-flight：并发第二次调用返回 busy。
- completed 才保存 decision.tail；failed/aborted/busy/limit 不推进。
- Provider/Tool/output/cursor/runtime 错误结构化并调用 logger；timeout/error 或 warn 可进入 TUI。

`RunResult` 是判别联合：

- completed：无 error。
- failed/aborted/busy：必须有稳定 code/message。
- 共同字段：status、trigger reason、toolCalls、cursorBefore/After。
- 不返回 Prompt、模型文本、完整推理、Provider 或凭证。

稳定错误码：`busy/cursor_changed/timeout/aborted/output_limit/provider_error/tool_error/run_limit/cursor_save_failed/runtime_error`。

### 13.6 当前测试状态

- 领域 5 新增 `config.test.ts` 6 项、`prompt.test.ts` 5 项；Runner 当前为 15 项。
- 核心收尾新增 `l1.test.ts` 2 项、`runtime-integration.test.ts` 6 项。
- Runner 测试使用 pi-ai 官方 faux provider 和 fake Service/History/Repository。
- 自动测试不读取 `.env`、API Key 或连接真实 Provider。
- 当前全量基线：155 项，13 files。

## 14. 测试规范

测试文档：`vivlos/tests/docs/memory/测试文档.md`。

用户新增硬性流程：

> 以后编写任何测试脚本之前，都必须先更新或编写测试文档，用户 review 后才写测试。

测试目标按四个 Agent 可靠性维度组织：

- 有效运行。
- 安全运行。
- 长期运行。
- 可维护运行。

当前脚本：

```text
vivlos/tests/memory/
├── infra.test.ts
├── security.test.ts
├── memory.test.ts
├── consolidate.test.ts
├── service.test.ts
├── consolidate-tool.test.ts
├── history.test.ts
├── trigger.test.ts
├── config.test.ts
├── prompt.test.ts
├── runner.test.ts
├── l1.test.ts
└── runtime-integration.test.ts
```

当前覆盖与数量：

- Repository/Event Logger：`infra.test.ts`。
- Security 权限和内容扫描：`security.test.ts`，38 项。
- 主动 Logic：`memory.test.ts`，20 项。
- 巩固 Logic：`consolidate.test.ts`，22 项。
- Service：`service.test.ts`，13 项。
- Consolidate Tool：`consolidate-tool.test.ts`，9 项。
- History/Cursor：`history.test.ts`，7 项。
- Trigger：`trigger.test.ts`，8 项。
- Config/Model：`config.test.ts`，6 项。
- Prompt：`prompt.test.ts`，5 项。
- Runner：`runner.test.ts`，15 项。
- L1 renderer：`l1.test.ts`，2 项。
- 运行链集成：`runtime-integration.test.ts`，6 项。
- 全量：155 项。

Service 测试重点：

- 主动 add/replace/remove committed。
- duplicate/noop。
- Logic/Security/cap rejected。
- unsafe candidate 不进入文件或 Event。
- usage/revision/Result/Event 一致。
- actual revision 决定 changed。
- Repository I/O 异常继续抛出。
- refine/merge 独立提交与 beforeEntries。
- 前序成功、后序失败不回滚。

## 15. 领域进度与后续顺序

### 已完成

领域 0：草稿清理。

- 从 `memory.ts` 删除错误的批次巩固类型、`consolidateEntries()` 和专用辅助。
- 主动逻辑保持不变，测试通过。

领域 1：巩固核心 Logic。

- `consolidate.ts`、refine/merge 和 22 项测试完成。

领域 2：权限与 Service。

- Command 所有权、权限矩阵、Event beforeEntries、Service、结果/失败边界和 13 项 Service 测试完成。

领域 3：Consolidate Tool。

- 独立 `createConsolidateTool()`、TypeBox schema、Consolidator 专用描述和安全结果适配已完成。
- Tool 只允许 refine/merge，不暴露操作 context，不注册到主模型 `createAdvancedTools()`。
- `consolidate-tool.test.ts` 9 项测试已完成并通过用户 review。

领域 4：操作留痕与触发。

- History/Cursor、Trigger、测试文档和 15 项测试已完成并通过用户 review。

领域 5：Consolidator Runtime。

- Config/Model、Prompt、Runner 和 23 项离线测试已完成。
- 领域 0-5 已通过 144 项全量测试、TypeScript typecheck 和 diff check。
- 已提交 `61acd47 feat: 完成 Memory 巩固触发与运行时`。

### 已完成：Memory 核心收尾

- L1 Prompt renderer、session MemoryRuntime、Trigger coordinator、capacity request、主 memory Tool、Event Logger、`memory:changed`、同 run SP 刷新和公共出口均已接通。
- 新增 L1 2 项和运行链 6 项测试；全量基线为 152 项。
- 已提交 `c201b4a feat: 完成 Memory 核心运行闭环`。
- 设计文档位于 `vivlos/agent/memory-refactor/docs/refactor.md` 和 `docs/逻辑调用.md`。

### 已完成：Workspace、Sidebar 与自动标题

当前组件结构：

```text
App
└── Workspace
    ├── WelcomeScreen | ChatPanel
    ├── ChatControls
    ├── Sidebar（仅 Session）
    └── Popup Layer
```

- Workspace 拥有 welcome/session、Sidebar 和 Popup 顶层显示逻辑；ChatPanel 只组合 Session 会话内容。
- ChatControls 复用 StatusBar、InputBar 和 InfoBar；没有复制输入或命令逻辑。
- Sidebar 固定宽度 42、无外边框；Welcome 不显示 Sidebar。
- Sidebar 顶部显示会话名称与浅色 session ID；StatusBar 不再显示 ID，但仍按 ID 重置计时。
- 自动标题使用首轮主模型独立生成：硬编码 SP、禁止 Emoji、单行、最多 24 个终端显示列；失败使用首条用户消息 fallback。
- 自动标题只调用 `renameIfUnnamed()`；用户 `/rename` 保持无条件且可随时多次修改，并发时用户名称优先。
- Sidebar Memory 区是可激活的 L1-L4 固定尺寸卡片：L1 使用模拟 usage，L2-L4 空白；鼠标、Left/Right、Escape 和输入焦点交互已完成。
- Memory 激活背景横向铺满 Sidebar，并有上下各一行 padding；卡片索引紧贴卡片底部。
- 已提交 `6a30123 feat: 完善会话工作区与事件架构`。

### 已完成：EventBus 类型拆分（任务一）

```text
infra/eventbus/
├── index.ts
├── types.ts
└── events/
    ├── main-agent-event.ts
    ├── memory-event.ts
    ├── session-event.ts
    ├── app-event.ts
    └── workspace-event.ts
```

- `types.ts` 只组合 `VivlosEvent` 总联合并重导出领域类型。
- 现有 25 个事件名称和 payload 未变化；公共 `eventbus/index.ts` 导入路径保持兼容。
- 任务二已补充 `consolidate-event.ts`；原有 25 个事件名称保持不变。

### 已完成：Consolidate 生命周期（任务二）

已新增事件：

```text
consolidate:started
consolidate:tool_started
consolidate:tool_completed
consolidate:ended
```

完成结果：

- 新增 `infra/eventbus/events/consolidate-event.ts`，并加入 `VivlosEvent` 和公共出口；原有 25 个事件不变。
- Consolidator 与主 Agent 共用现有 EventBus，不创建第二个总线；MemoryRuntime 原样注入共享实例。
- Runner 获得 single-flight 后发布 started；busy 没有实际运行，不发布 started/ended。
- 只转发独立 agentLoop 的 tool execution start/end；不转发 agent、turn、thinking、message 或 update。
- tool 事件保留 sessionId、toolName、callId、args/result/success。
- active run 的类型明确排除 busy；每个 started 恰好对应一个 ended，ended 携带安全 RunResult 摘要。
- 事件是旁路观测，不改变 RunResult、cursor、错误码、Tool 顺序和日志语义。
- 用户本次明确要求跳过测试文档步骤；直接新增 MEM-RUN-013/014/015 自动化覆盖。
- 定向 Runner 15 项、全量 155 项、typecheck 和 diff check 均通过。
- 任务二未修改 useAgent 或 AgentMessageCard。

### 已完成：Tool 调用展示优化（任务三）

- 主 Agent Tool start 事件已补充 args；主 Agent 与 Consolidate Tool 事件进入统一 LogEntry，并保留来源、args、result 和 success。
- Consolidate started/ended 使用不计入 Tool 数量的运行标记，零 Tool 审视也可显示状态。
- 连续同名 Tool 只在渲染层按 source+name 分组，原始操作记录不删除。
- Compact 只显示该组最新动作并原地刷新：

```text
✓ Memory
┆ replace memory.md "用户修正了后端运行环境"
```

- `/detail` 展开后按顺序显示该组全部动作：

```text
✓ Memory
┆ add memory.md "..."
┆ replace memory.md "..."
```

- 该分组规则适用于全部 Tool；Memory 和 Consolidate 使用同一专属视觉体系，但名称不同。
- Memory/Consolidate 的 spinner、完成标记、标题、动作和双引号使用粉色；失败标记保持红色。
- `memory.md/user.md` 使用回答正文颜色，引号内内容使用普通 Tool Result 颜色。
- Thinking 或不同 Tool 会断组；失败组显示错误终态，未知 Tool 保留原 result 摘要。
- Session 历史按 callId 恢复主 Agent Tool args/result；Consolidator 独立日志不伪造持久恢复。
- Memory Tool description 已明确 add/replace/remove 的必填签名与 old_text 来源，并修正为实际变化后下一次推理刷新 Memory context；缺参结果会指导模型补全重试。
- 当前自动验证为 155 pass、typecheck 和 diff check 通过；用户已完成本轮终端视觉调整。

### 后续：L1 主动记忆数据接入

- `/new` 保持 pending；第一条普通消息被接受时激活 Session，并幂等创建空 `memory.md` 与 `user.md`。
- Sidebar 改读真实 Overview：字符占比、entry 数、更新时间和真实位置；不显示或编辑 Memory 内容。
- 此阶段尚未展开 Todo，不得提前实现。

## 16. 工作树注意事项

已提交的当前主线：

- `61acd47 feat: 完成 Memory 巩固触发与运行时`
- `c201b4a feat: 完成 Memory 核心运行闭环`
- `6a30123 feat: 完善会话工作区与事件架构`

任务二、任务三、Runner 测试和本规格已纳入 `feat: 接通巩固事件与工具展示`。提交后工作树仍会保留下面明确排除的旧文件删除和未跟踪目录。

当前存在与 Memory 无关的未跟踪目录 `.VSCodeCounter/2026-07-27_18-28-27/`，不要修改、删除或纳入后续 Memory 提交。

用户已把 `memory-refactor/refactor.md` 和 `逻辑调用.md` 移到 `memory-refactor/docs/`；不要移回根目录。

工作树仍存在旧 `vivlos/agent/memory/` 文件删除和根路径 `memory-refactor/refactor.md` 删除。这些删除没有进入最近两次提交；不要恢复、删除、暂存或提交，除非用户明确要求。

旧 `vivlos/agent/memory/` 不属于当前设计来源；只从 `memory-refactor/`、现有 Infra 和本文推导，不恢复其架构。

不要执行 destructive git 命令，不要删除旧改动，不要 commit/push，除非用户明确要求。

## 17. 下一次恢复后的第一条回复

压缩后若用户要求继续：

1. 说明已从本文恢复上下文。
2. 通过 `git log -1` 确认最新提交为 `feat: 接通巩固事件与工具展示`，测试基线为 155 项。
3. 说明四个 `consolidate:*` 生命周期事件、共享 EventBus 注入、Tool LogEntry 桥接和渲染分组均已完成。
4. 任务二和任务三已经结束，不继续修改其视觉细节，除非用户反馈新的问题。
5. 下一步只展开 L1 主动记忆数据接入的详细 Todo 并等待批准。
6. 不提前修改 L1 文件创建或 Sidebar Overview。
7. 不修改 `memory-refactor/docs/` 结构，不触碰 `.VSCodeCounter/` 或工作树中的旧文件删除。

如果用户指出本文与最新指令冲突，以用户最新指令为准，并同步更新本文。
