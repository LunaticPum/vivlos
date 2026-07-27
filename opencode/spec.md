# Memory Refactor 协作与恢复规格

> 上下文压缩或新 Agent 接手后，先完整阅读本文，再读取 `vivlos/agent/memory-refactor/refactor.md` 和当前领域文件。不要从旧 `vivlos/agent/memory/` 推断新实现。

## 1. 当前恢复点

- 日期：2026-07-27。
- 仓库：`D:\VSProject\Agent\my_agent`。
- 当前分支：`memory-refactor`。
- Memory 领域 0-3 基线提交：`257fc04 feat: 完成 Memory 巩固工具链`。
- fresh 实现位于 `vivlos/agent/memory-refactor/`，尚未提交，多数文件在 Git 中仍是 untracked。
- 领域 0、领域 1、领域 2、领域 3 已完成代码和测试。
- 当前等待用户 review **领域 3：Consolidate Tool**。
- 不要主动展开领域 4；用户确认领域 3 后，先移除领域 3 Todo 明细，再为领域 4 单独展开 Todo，等用户 review 后执行。

最近一次验证：

```text
bun test          -> 106 pass, 0 fail, 6 files
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

当前已存在 fresh Consolidate Tool；尚不存在 `consolidator/`、L1 layer 实现和公共 index，不要提前创建。

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

## 13. 测试规范

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
└── consolidate-tool.test.ts
```

当前覆盖与数量：

- Repository/Event Logger：`infra.test.ts`。
- Security 权限和内容扫描：`security.test.ts`，38 项。
- 主动 Logic：`memory.test.ts`，20 项。
- 巩固 Logic：`consolidate.test.ts`，22 项。
- Service：`service.test.ts`，13 项。
- Consolidate Tool：`consolidate-tool.test.ts`，9 项。
- 全量：106 项。

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

## 14. 领域进度与后续顺序

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
- `consolidate-tool.test.ts` 9 项测试已完成，当前等待用户最终 review。

### 未开始

领域 4：操作留痕与触发。

- 读取主模型 operation 留痕作为整理参照。
- 低频操作计数、容量压力、主模型策展请求。
- 操作留痕不是新增事实来源；当前 Markdown 始终是 source 基准。

领域 5：Consolidator Runtime。

- Prompt、上下文和受限多次 Tool 调用循环。
- 输入包含当前 L1、usage/cap、主操作留痕和职责约束。
- 零次或多次独立 refine/merge；无法无损整理时结束。

领域 6：运行时集成。

- Agent Loop、组合根、SP 刷新和端到端验证。

之后单独规划 L1 layer 和公共 index 收敛。

## 15. 工作树注意事项

当前工作树不干净。以下内容可能来自旧方案、用户或其他并行工作，禁止擅自回滚：

- 旧 `vivlos/agent/memory/` 下多处 modified 文件。
- 未跟踪的 `vivlos/agent/memory/events/checkpoint.ts`。
- 未跟踪的 `vivlos/agent/memory/events/context.ts`。
- Agent Loop、Tool、OpenTUI、架构文档等旧方案改动。
- `vivlos/entries/opentui/components/popups/ApiKeyPopup.tsx` 是无关改动。
- `.VSCodeCounter/` 是无关未跟踪目录。

fresh Memory 文件多数 untracked，因此普通 `git diff` 不会显示其内容。Review 时使用 `git status --short`、直接 Read 和测试，不要误以为无 diff 就没有改动。

不要执行 destructive git 命令，不要删除旧改动，不要 commit/push，除非用户明确要求。

## 16. 下一次恢复后的第一条回复

压缩后若用户要求继续：

1. 说明已从本文恢复上下文。
2. 确认领域 3 当前为完成待 review，106 tests/typecheck/diff check 已通过。
3. 若用户确认领域 3：更新 Todo，移除领域 3 明细并只展开领域 4 Todo。
4. 不要在同一回复中直接实现领域 4。

如果用户指出本文与最新指令冲突，以用户最新指令为准，并同步更新本文。
