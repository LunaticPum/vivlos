# Memory Refactor

## 1. 文档目标

本文定义 Vivlos Memory 的全新实现。新实现放在 `agent/memory-refactor/`，不在旧 `agent/memory/` 上继续叠加修改，也不复制旧模块的结构。

当前只实现 session 独立的 L1 Markdown Memory。设计重点是职责清楚、调用链可见，不提前实现 L2-L4 或通用 Memory Provider 框架。Consolidator 是 L1 的低频维护流程，不构成新的记忆层级。

## 2. L1 行为

### 2.1 每个 Session 独立

每个 session 独立拥有两个 L1 文件：

```text
.vivlos/sessions/<timestamp>_<sessionId>/
├── history.jsonl
├── memory.md
├── user.md
└── memory-events.jsonl
```

- `memory.md`：项目、环境、决策和长期事实。
- `user.md`：用户偏好、画像和沟通方式。
- 新 session 不加载其他 session 的 L1 Memory。
- 新 session 默认没有 `memory.md` 和 `user.md`。
- 首次发生有效写入时才创建对应文件。
- 用户需要复用 L1 时，可以手动复制这两个文件作为另一个 session 的初始文件；Memory 模块不负责自动同步。

### 2.2 当前没有多文件加载

L1 当前只读取当前 session 的 `memory.md` 和 `user.md`，不实现：

- 自定义 Memory 文件列表。
- 多个 Memory 文件合并。
- Memory Wiki。
- 跨 session 自动共享。
- L2 Session Search。
- L3 External Memory Provider。
- L4 文件知识库。

L2-L4 后续主要通过检索/回召与主动记忆连接，届时单独设计，不在本轮预留复杂接口。

### 2.3 Memory 变化后立即刷新 SP

主动记忆和记忆巩固都可能修改 L1。只有实际内容发生变化时才重建 System Prompt：

| 操作结果 | Markdown 改变 | 重建 SP |
|---|---:|---:|
| add 成功 | 是 | 是 |
| replace/refine 成功 | 是 | 是 |
| remove 成功 | 是 | 是 |
| merge 成功 | 是 | 是 |
| duplicate | 否 | 否 |
| noop | 否 | 否 |
| rejected | 否 | 否 |
| 操作失败 | 否 | 否 |

写入成功后的流程：

```text
Memory 写盘成功
-> revision 发生变化
-> 发布 memory:changed
-> 当前 session 的 SP 失效
-> 重新读取 memory.md/user.md
-> 下一次 LLM 推理使用新 SP
```

删除最后一条记忆也属于有效变化。文件变空后必须重建 SP，不能残留旧 Memory 内容。

## 3. Memory 职责划分

### 3.1 安全扫描

`security.ts` 负责：

- Prompt injection 和角色覆盖扫描。
- System/tool 控制标记扫描。
- API Key、密码、私钥和 token 扫描。
- 不可见 Unicode 和方向控制字符扫描。
- Markdown 条目分隔符注入扫描。
- 主模型与巩固模型的操作权限检查。
- Memory 注入 SP 前的数据转义。

Security 不读写文件，不修改条目，不发送事件。

#### 3.1.1 Security API

Security 是无状态纯函数集合，不需要 class、factory 或生命周期：

```ts
interface SecurityViolation {
  code:
    | "separator_injection"
    | "prompt_injection"
    | "control_marker"
    | "credential_exposure"
    | "invisible_unicode"
    | "operation_not_allowed";
  message: string;
}

function scanContent(content: string): SecurityViolation[];

function checkPermission(
  actor: MemoryActor,
  action: MemoryAction,
): SecurityViolation | null;

function escapeForPrompt(content: string): string;
```

规则：

- `scanContent()` 扫描准备持久化的最终完整条目。
- 返回空数组表示未发现安全问题。
- 同一内容可以返回多个违规，不抛异常。
- `checkPermission()` 只判断 actor/action，不检查文件和内容。
- `escapeForPrompt()` 只做 Prompt 结构转义，不替代内容扫描。

#### 3.1.2 内容扫描边界

扫描类别：

| code | 检查内容 |
|---|---|
| `separator_injection` | 独立的 Markdown `---` 分隔行 |
| `prompt_injection` | 忽略旧指令、角色覆盖等指令注入表达 |
| `control_marker` | System/tool 角色前缀和模型控制标记 |
| `credential_exposure` | API Key、密码、私钥、token 等凭证 |
| `invisible_unicode` | 零宽字符、方向控制字符等不可见 Unicode |

不同操作传入 Security 的内容：

```text
add      -> 新条目的完整内容
replace  -> 替换完成后的完整条目
refine   -> 精炼完成后的完整条目
merge    -> 合并完成后的完整条目
remove   -> 不扫描内容，只检查权限
```

Security 不负责：

- 空内容和参数缺失。
- oldText 是否存在或是否唯一。
- duplicate 判断。
- 字符上限。
- Markdown 文件解析和规范化。
- reasonCode 业务语义。

这些分别由 Memory logic、Service 或 Repository 处理。

#### 3.1.3 操作权限

| actor | add | replace | remove | merge | refine |
|---|---:|---:|---:|---:|---:|
| `main` | 允许 | 允许 | 允许 | 禁止 | 禁止 |
| `consolidator` | 禁止 | 禁止 | 禁止 | 允许 | 允许 |

- 主模型使用明确 CRUD，不调用 merge/refine。
- 巩固模型不能直接 remove，也不能使用 replace 绕过 refine 语义。
- 权限拒绝返回 `operation_not_allowed`。

#### 3.1.4 Prompt 转义

当前 SP 使用 XML 数据边界，因此 `escapeForPrompt()` 至少转义：

```text
& -> &amp;
< -> &lt;
> -> &gt;
```

转义只在构造 L1 SP 内容时使用。Repository 保存原始合法文本，不保存转义后的实体。

### 3.2 记忆仓储

Repository 位于 `infra/storage/memory/repository.ts`，负责当前 session 的 `memory.md` 和 `user.md`：

- 读取和写入。
- Markdown 解析和规范化序列化。
- 字符用量和上限检查。
- 内容 revision 计算。
- 文件不存在和空文件处理。

Repository 不判断 actor 权限，不扫描 prompt injection，不决定 add/merge/refine 的业务语义。

### 3.3 记忆逻辑

`memory.ts` 只执行主模型主动记忆使用的纯内存操作：

- `add`
- `replace`
- `remove`

Memory 逻辑接收单个文件的当前 entries 和操作参数，返回修改后的 entries 与 `changed`。它不访问文件系统、不构建 Prompt、不发送 Event，也不处理巩固命令。

#### 3.3.1 主动记忆 API

主动记忆使用三个文件无关的纯函数：

```ts
function addEntry(
  entries: readonly string[],
  content: string,
): MemoryLogicResult;

function replaceEntry(
  entries: readonly string[],
  oldText: string,
  newText: string,
): MemoryLogicResult;

function removeEntry(
  entries: readonly string[],
  oldText: string,
): MemoryLogicResult;
```

`memory.ts` 不接收 `MemoryFile`。Service 先选择 `memory` 或 `user` 的 entries，再调用同一套逻辑，避免复制两份 CRUD。

#### 3.3.2 结果契约

Logic 使用项目统一的 `Result<T, E>`：

```ts
interface MemoryLogicValue {
  status: "committed" | "noop";
  changed: boolean;
  entries: readonly string[];
  before?: string;
  after?: string;
}

interface MemoryLogicError {
  code: "invalid_input" | "not_found" | "ambiguous_match";
  message: string;
}

type MemoryLogicResult = Result<MemoryLogicValue, MemoryLogicError>;
```

不变量：

- `status="committed"` 时 `changed=true`。
- `status="noop"` 时 `changed=false`。
- error 不返回伪造的新 entries。
- Logic 不返回 revision、usage、file 或 Event 字段。

#### 3.3.3 输入规范化

- `content`、`oldText` 和 `newText` 在 Logic 入口执行 `trim()`。
- add 的 `content` 不能为空。
- replace 的 `oldText/newText` 都不能为空；删除必须使用 remove。
- remove 的 `oldText` 不能为空。
- 当前 entries 已由 Repository 规范化，Logic 不重复 trim 或过滤已有 entries。
- 分隔符、凭证和 injection 由 Security 检查，不在 Logic 重复扫描。
- 字符上限由 Repository 检查。

#### 3.3.4 Add 语义

```text
content 为空
-> invalid_input

entries 已存在完全相同的 content
-> status=noop
-> changed=false
-> entries 返回原引用

否则
-> 在末尾追加 content
-> status=committed
-> changed=true
-> 返回新数组
```

duplicate 是 add 的 `noop` 结果，不是独立的 MemoryAction。

#### 3.3.5 唯一子串匹配

replace/remove 使用相同的唯一子串规则：

```text
oldText 在全部 entries 中出现 0 次
-> not_found

oldText 在全部 entries 中出现超过 1 次
-> ambiguous_match

oldText 在全部 entries 中只出现 1 次
-> 允许继续
```

匹配按实际子串出现次数计算，不只按命中的 entry 数量计算。同一 entry 内出现两次也属于 `ambiguous_match`，调用方需要提供更具体的 oldText。

#### 3.3.6 Replace 语义

```text
唯一定位 oldText
-> 在命中的 entry 中替换该子串
-> trim 最终 entry
```

- 最终 entry 与原 entry 相同：返回 noop 和原 entries 引用。
- 最终 entry 与另一个现有 entry 完全相同：删除被替换的旧 entry，保留已经存在的目标 entry，返回 committed。
- 其他情况：用最终 entry 替换原 entry，返回 committed。
- `before` 是完整旧 entry，`after` 是完整最终 entry。

目标重复时不能返回 noop，否则旧事实仍会保留；也不能写入重复条目，因此采用“移除旧 entry、保留已有目标 entry”的确定行为。

#### 3.3.7 Remove 语义

```text
唯一定位 oldText
-> 删除包含该子串的完整 entry
-> status=committed
-> changed=true
```

- `before` 是被删除的完整 entry。
- `after` 不存在。
- 删除最后一条后返回空数组，由 Repository 写成空文件。

#### 3.3.8 不可变性

- 所有函数都不得修改输入 `entries`。
- committed 返回新数组。
- noop 返回原 `entries` 引用，便于调用方确认没有状态变化。
- error 不执行任何部分修改。

### 3.4 记忆巩固

记忆巩固是主模型策展 L1 的低频辅助流程。主模型仍是 Memory 内容权威，Consolidator 只优化已有条目的表达和空间占用，不重新决定应该记住什么。

#### 3.4.1 责任划分

| 能力 | 主模型 | Consolidator |
|---|---:|---:|
| 选择值得长期保存的事实 | 是 | 否 |
| add 新事实 | 是 | 否 |
| 根据用户纠正 replace | 是 | 否 |
| 根据用户要求 remove | 是 | 否 |
| refine 单条已有记忆 | 否 | 是 |
| merge 多条已有记忆 | 否 | 是 |
| 解决事实冲突或判断过时 | 是 | 否，只能跳过 |
| 改变 memory/user 归属 | 是 | 否 |

核心边界：

```text
主模型决定“记什么”
Consolidator 优化“怎么存”
```

Consolidator 不能补充主模型遗漏、根据常识扩写、推断新偏好、纠正事实、恢复已删除内容或把 entry 移到另一个文件。发现冲突、过时或归类错误时不执行操作。

#### 3.4.2 触发与输入

Consolidator 不在每个 Turn 后运行。以下信号可以触发一次低频策展：

- 当前 session 累计达到配置数量的主模型 committed Memory 操作。
- `memory.md` 或 `user.md` 接近字符上限。
- 主模型写入因容量不足失败，并请求先整理 L1。

触发后只向 Consolidator 提供：

- 当前 session 的 `memory.md` 和 `user.md` entries。
- 两个文件各自的 usage/cap。
- 当前策展区间内主模型的 Memory 操作留痕，包括 action、outcome、file、before/after 和简短 reason。
- 只允许 refine/merge 的职责和安全约束。

操作留痕有两个用途：

- 帮助识别近期重复写入、连续纠正和可以安全压缩的相关 entries。
- 避免 merge/refine 推翻主模型刚完成的 replace/remove 或重复处理已经整理过的内容。

当前 Markdown 始终是有效状态和 source 匹配基准；操作留痕只是整理参照，不能用于添加事实、恢复已删除内容或覆盖当前 Markdown。Consolidator 不读取完整 session、来源消息或原始 tool result，rejected 操作也不向它暴露被安全机制拒绝的候选内容。

#### 3.4.3 独立操作

Consolidator 在一次受限模型循环中可以连续调用零次或多次 consolidate tool。每次调用都是独立操作：

```ts
type ConsolidationCommand =
  | {
      action: "refine";
      file: MemoryFile;
      oldEntry: string;
      newEntry: string;
    }
  | {
      action: "merge";
      file: MemoryFile;
      oldEntries: readonly string[];
      newEntry: string;
    };
```

- 不使用 ConsolidationPlan、独立 Validator、Receipt 或跨文件批量事务。
- 不提供 add、replace、remove 或 noop。
- 没有值得整理的内容时，模型不调用工具并直接结束。
- 前一个操作成功、后一个操作失败时，保留前一个结果，不执行整批回滚。
- 每次工具返回完整 before/after、当前 usage 和 revision，供模型决定是否继续。

#### 3.4.4 Refine

refine 用于压缩或澄清一条已有记忆：

- `oldEntry` 必须与指定文件中的一条完整 entry 精确匹配。
- `newEntry` 是完整最终条目，不能为空。
- 只能改善表达，不得增加旧 entry 中不存在的事实。
- 不得改变事实含义、文件归属或删除该事实。
- 写入后该文件的规范化字符用量不能增加。

#### 3.4.5 Merge

merge 用于把同一文件中的多条重叠记忆压缩为一条：

- `oldEntries` 至少包含两个互不重复的完整 entry。
- 每个 source 必须在指定文件中精确存在。
- `newEntry` 必须保留 sources 的事实并集，不得添加新事实。
- 只删除明确列出的 sources，不修改其他 entries。
- `newEntry` 放在最早 source 的位置，其他条目的相对顺序保持不变。
- 写入后该文件的规范化字符用量必须减少。

“是否保持原意”由 Consolidator Prompt 约束；程序只执行可以确定的结构、安全和容量检查。

#### 3.4.6 Service 检查

不建立单独的 ConsolidationValidator。每次 refine/merge 都通过现有 MemoryService 独立检查和提交：

1. actor/action 权限。
2. file 与参数完整性。
3. 每个完整 source 是否恰好存在一次，merge sources 是否互不重复。
4. 最终完整 entry 的 Security 扫描。
5. 最终状态不能产生精确重复。
6. 未引用 entries 保持原值和原顺序。
7. 文件字符用量不能增加且不能超过 cap。

任何 rejected 操作都不修改 Markdown。成功操作写入单个文件，发布 `memory:operation` 和 `memory:changed`，并在下一次 LLM 推理前刷新当前 session 的 L1 SP。

#### 3.4.7 模型目标

Consolidator 的目标按优先级排列：

1. 合并表达不同但事实重叠的 entries。
2. 删除冗余措辞，保留独立、明确、可直接使用的事实。
3. 统一同一文件中的表达粒度和格式。
4. 降低字符用量，为主模型后续 add/replace 留出空间。

Consolidator 不是事实审查者。无法确认能否无损整理时，保持原文并结束。

### 3.5 L1 记忆层

`layers/l1.ts` 负责：

- 读取当前 session 的 `memory.md` 和 `user.md`。
- 对持久化内容执行 Prompt 转义。
- 构造注入 SP 的 Memory 字符串。
- 正确处理两个文件都为空的情况。

L1 记忆层不修改 Memory，也不管理 PromptBuilder 生命周期。

### 3.6 操作留痕

每次主动记忆或巩固操作到达终态时发布 `memory:operation`：

```text
谁
+ 为什么
+ 对哪个记忆
+ 做了什么
+ 结果是什么
+ 来源是哪
```

Infra Event Logger 订阅该事件并追加 `memory-events.jsonl`。Event 是操作历史，不用于重放或重建当前 Memory；Markdown 始终是 L1 当前有效状态。

### 3.7 Memory Tools

工具继续遵循项目现有目录约定：

```text
agent/tools/advanced/memory/
├── memory.ts
├── consolidate.ts
└── description.ts
```

- `memory.ts`：主模型使用，允许 add/replace/remove。
- `consolidate.ts`：巩固模型使用，只允许独立的 refine/merge。
- Tool 只负责 schema、参数转换、调用 Service 和格式化模型可读结果。
- Tool 不直接访问 Repository。

## 4. 目录结构

```text
vivlos/agent/memory-refactor/
├── refactor.md
├── index.ts
├── types.ts
├── security.ts
├── memory.ts
├── consolidate.ts
├── service.ts
├── layers/
│   └── l1.ts
└── utils/
    └── event-logger.ts

vivlos/agent/tools/advanced/memory/
├── memory.ts
├── consolidate.ts
└── description.ts

vivlos/infra/storage/memory/
├── index.ts
└── repository.ts
```

目录已经表达 Memory 上下文，文件名不重复添加 `memory-` 前缀。

## 5. 类型组织

不再把所有内部类型集中到一个大型 `types.ts`。

公共 `types.ts` 只保留真正跨模块共享的少量类型：

```text
MemoryFile
MemoryActor
MemoryAction
MemoryOutcome
MemoryCommand
MemoryResult
```

其他类型跟随实现文件：

- Security violation 留在 `security.ts`。
- Repository snapshot、write result 留在 `repository.ts`。
- 主动 Memory operation 和内部结果留在 `memory.ts`。
- refine/merge 命令和纯逻辑结果留在 `consolidate.ts`。
- L1 接口与渲染结果留在 `layers/l1.ts`。
- EventBus 事件类型放在 `infra/eventbus/types.ts`。

`index.ts` 只导出其他模块真正需要的工厂和公共类型，不导出全部内部辅助类型。

## 6. 依赖方向

```text
memory tool
-> MemoryService

MemoryService
-> Security
-> Memory logic
-> Consolidation logic
-> MemoryRepository
-> publish(event)

consolidate tool
-> MemoryService

layers/l1.ts
-> MemoryRepository
-> Security.escapeForPrompt

infra/storage/memory/repository.ts
-> node:fs

agent/memory-refactor/utils/event-logger.ts
-> EventBus
-> node:fs
```

约束：

- Tool 不依赖 Repository。
- Memory logic 和 Security 不依赖 Infra。
- Consolidation logic 不执行 I/O、不扫描内容、不发布 Event。
- Repository 不依赖 Agent、Tool 或 PromptBuilder。
- Service 不管理 EventBus 订阅和清理。
- Event Logger 不参与 Memory 操作是否成功的判断。

## 7. Infra Storage 设计

### 7.1 Repository

Repository 绑定一个 `sessionDir`，不自行查找当前 session：

```ts
createMemoryRepository(sessionDir, limits)
```

建议提供的最小能力：

```ts
interface MemoryRepository {
  readSnapshot(): MemoryStorageSnapshot;
  write(
    file: MemoryFile,
    entries: readonly string[],
  ): Result<MemoryStorageSnapshot, MemoryRepositoryError>;
}
```

Repository 使用统一格式：

```text
条目之间：\n---\n
文件末尾：一个 \n
空文件：真正的空内容
读取：兼容 LF 和 CRLF
```

`readSnapshot()` 一次返回：

```text
memory entries
user entries
memory/user usage
combined revision
```

revision 基于规范化后的两个文件内容计算，不受多余首尾空白和 CRLF/LF 差异影响。

Repository 写入前按最终规范化内容检查字符上限。超限属于可预期的写入结果，不静默截断文件。

### 7.2 EventBus 事件

在 `infra/eventbus/types.ts` 中定义两个事件。

操作留痕事件：

```ts
{
  type: "memory:operation";
  eventId: string;
  timestamp: number;
  sessionId: string;
  actor: "main" | "consolidator";
  action: "add" | "replace" | "remove" | "merge" | "refine";
  outcome: "committed" | "noop" | "rejected";
  file: "memory" | "user";
  reasonCode: string;
  reason?: string;
  before?: string;
  beforeEntries?: readonly string[];
  after?: string;
  revisionBefore: string;
  revisionAfter: string;
  source?: {
    sessionId: string;
    historyLine: number;
  };
  errorCode?: string;
  errorMessage?: string;
}
```

Memory 改变通知：

```ts
{
  type: "memory:changed";
  sessionId: string;
  file: "memory" | "user";
  revisionBefore: string;
  revisionAfter: string;
}
```

规则：

- `action` 表示模型请求的实际动作。
- duplicate、reject 不作为 action；它们由 `outcome` 表示。
- 每个终态操作都发布 `memory:operation`。
- merge 使用 `beforeEntries` 保存完整 sources。
- 只有 revision 改变时才发布 `memory:changed`。
- rejected Event 不保存被安全机制拒绝的原始候选内容，避免把凭证或 injection payload 写入日志。

### 7.3 Event Logger

`agent/memory-refactor/utils/event-logger.ts` 负责一次性订阅 `memory:operation`：

```ts
createMemoryEventLogger(eventBus, resolveSessionDir)
```

流程：

```text
MemoryService 发布 memory:operation
-> EventBus
-> MemoryEventLogger
-> resolveSessionDir(sessionId)
-> append memory-events.jsonl
```

Event Logger：

- 在组合根中只创建一次。
- 返回幂等 disposer，用于取消订阅。
- 使用 JSONL，一行一个完整事件。
- 不为每次 Memory 操作重新创建实例。
- 不读取或修改 `memory.md` 和 `user.md`。
- 写入失败时记录 error log，不回滚已经成功的 Markdown 写入，也不改变成功的 Tool Result。

EventBus 留痕定位为 best-effort 操作历史，不是合规审计或事件溯源。如果未来要求操作和审计必须原子成功，需要改为同步持久化或事务型 outbox，不在当前范围内实现。

## 8. Service 调用链

主动记忆：

```text
memory tool
-> MemoryService
-> Security
-> Repository.readSnapshot
-> Memory logic add/replace/remove
-> changed=false: 发布 operation(noop/rejected)，返回
-> changed=true: Repository.write
-> 发布 operation(committed)
-> 发布 memory:changed
-> 返回 MemoryResult
```

记忆巩固：

```text
触发一次 Consolidator
-> 注入当前 memory/user entries 与 usage/cap
-> 模型调用 consolidate tool(refine/merge)
-> MemoryService 重新读取当前 snapshot
-> Security + Consolidation logic
-> rejected/noop: 发布 operation，返回结果
-> changed: Repository.write(单个 file)
-> 发布 operation(committed)
-> 发布 memory:changed
-> Tool 返回 before/after/usage/revision
-> 模型继续调用工具或结束
```

主动记忆 Service 的核心结果至少包含：

```ts
{
  status: "committed" | "noop" | "rejected";
  changed: boolean;
  revisionBefore: string;
  revisionAfter: string;
}
```

SP 所有者只根据 `changed` 或 `memory:changed` 处理刷新，不理解 add/merge/refine 的内部逻辑。Consolidator 每个成功动作独立刷新对应文件，不存在跨文件批次刷新。

## 9. 错误规则

- 模型命令、权限、匹配、重复、容量等预期业务结果使用结构化 Result。
- Repository 文件系统 I/O 异常可以抛出，由上层统一处理。
- Event Logger 写入异常不得改变已经完成的 Memory 操作结果。
- 不建立 Memory 专用异常类体系。
- 不用 EventBus Event 重放当前 Memory。

## 10. 当前实现顺序

已完成并通过测试的部分：

1. session-local Memory Repository、combined revision 和字符上限。
2. `memory:operation`、`memory:changed` 与 best-effort Event Logger 基础。
3. Security 扫描、actor/action 权限和 Prompt 转义。
4. 主动记忆 add/replace/remove 纯逻辑。

下一阶段必须按以下顺序推进，每一步单独 review：

1. Review 本文的主模型/Consolidator 责任边界和独立 refine/merge 设计。
2. 删除 `memory.ts` 中未经批准的巩固草稿，主动 add/replace/remove 保持不变。
3. 新增 `consolidate.ts`，定义 refine/merge 命令与纯逻辑结果。
4. 实现 refine 的完整 entry 匹配、不可增量和不可变性。
5. 实现 merge 的完整 sources 匹配、稳定位置和字符缩减。
6. 收紧 Security 权限，使 consolidator 只允许 refine/merge。
7. 在 MemoryService 中编排每个独立巩固动作、Repository.write 和 Event 发布。
8. 实现只暴露 refine/merge 的 consolidate tool 与受限模型循环。
9. 接入低频操作计数、容量压力和主模型请求触发。
10. 增加巩固测试，并完成 L1 layer、Service 与公共出口总 review。

## 11. 测试目录

所有测试统一放在 `vivlos/tests/`，不在业务模块内部创建 `test/` 或 `*.test.ts`：

```text
vivlos/tests/
└── memory/
    └── infra.test.ts
```

后续 Memory 层测试继续添加到 `vivlos/tests/memory/`，并按层命名，例如 `service.test.ts`、`logic.test.ts` 和 `snapshot.test.ts`。
