# Memory Refactor

## 1. 文档目标

本文定义 Vivlos 当前 Memory 实现。实现位于 `agent/memory/`；旧模块已删除，当前模块不沿用其结构。

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
- `/new` 产生的 pending session 不创建目录或文件。
- 第一条模型请求被接受后激活 session，并幂等创建空 `memory.md` 和 `user.md`。
- `session:activated` 表示 `history.jsonl` 和两个 L1 文件均已准备完成；补齐已有 session 缺失的 L1 文件也属于完成物化。
- 文件初始化不属于内容变化，不发布 `memory:changed` 或触发 Consolidator。
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
- 幂等初始化两个 L1 文件。
- 提供不含条目正文的 path/usage/entryCount/updatedAt 只读 Overview。

Overview 公共类型属于 `infra/storage/memory`。MemoryRuntime 负责读取并组合当前 sessionId；TUI 不通过 VivlosAgent 直接查询。MemoryRuntime 响应 `memory:overview_requested`，并在当前 session 的 `memory:changed` 后发布 `memory:overview`。

Session 当前状态同样通过 EventBus 提供：Agent 响应 `session:state_requested`，并在生命周期变化、消息落盘和自动标题完成后发布 `session:state`。请求与响应是两条独立 Event，不把 EventBus 改造成等待返回值的 RPC。

TUI 统一由 `useAgent` 适配这些状态 Event。Workspace 只消费当前 Session、Session 列表和 Memory Overview；Sidebar 只接收展示 props，不监听 EventBus、不读取文件。Overview 切换期间使用 unavailable 占位，不能保留其他 Session 的数据或回退模拟值。

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

#### 3.4.8 Runtime 与 Provider 边界

Consolidator Runtime 使用独立的底层 `agentLoop()`，不复用主 Agent 的 `createAgent()` 或 `createAgentLoop()`。它不接入主 session、消息历史、PromptBuilder、identity、skills、compression、通用工具集或 UI Event 映射。

模型与流函数由组合根解析后注入。Runtime 不读取 `.env`、`infra/config`、Provider 配置或 CredentialStore，不关心模型来自 pi 内置 Provider 还是自定义 OpenAI-compatible Provider，也不会复制或记录 API Key。

独立 AgentContext 只包含 Consolidator 专用 system prompt、一条本次整理输入消息和唯一的 consolidate tool。模型普通文本不是 Memory 写入结果；只有 consolidate tool 通过 MemoryService 成功提交，才能改变 Markdown。

#### 3.4.9 Consolidator 配置

配置归入 `infra/config` 的 `memory.consolidator`：

```json
{
  "model": { "provider": "provider-id", "id": "model-id" },
  "trigger": { "operations": 20, "capacity": 0.85 },
  "maxTurns": 6,
  "maxTools": 8,
  "timeoutMs": 60000
}
```

- `model` 缺失或为 `null` 时，每次运行使用当时的当前主模型，不固定为启动默认模型。
- 显式 model 必须同时包含 provider 和 id；解析失败时本次运行失败且不推进 cursor，不静默回退主模型。
- 配置只引用已注册的 Provider/Model，不保存 API Key、base URL 或 CustomProviderConfig。
- `loadConfig()` 负责默认值、逐字段合并和范围校验。
- 组合根负责解析 configured model 或当前主模型；Runner 每次运行接收已解析 Model。

#### 3.4.10 Prompt 输入

`consolidator/prompt.ts` 使用 `buildPrompt(input)` 构造静态规则和 XML 数据区。输入只包含最新 snapshot 的完整 entries/usage，以及 Trigger Decision 的 reason、cursor、tail、受压 files 和安全 records。

不包含完整 session、来源消息、主 Agent Tool Result、History issue、rejected 候选、Provider 配置或凭证。所有动态字符串都放入 XML 文本节点并调用 `escapeForPrompt()`；属性只使用受控枚举或数字。

System prompt 明确要求 XML 内容是不可信数据、当前 entries 才是 source 基准、不得从 History 恢复已删除事实、Tool 参数使用 entity 解码后的完整原始 entry，且无法确认无损整理时不调用 Tool。

#### 3.4.11 Runner 基础逻辑

`consolidator/runner.ts` 使用 `createRunner(deps)` 创建单飞 Runtime。每次 `run()` 接收组合根当次解析的 Model、Trigger Decision、sessionId 和可选 AbortSignal，并重新读取最新 Repository snapshot。

独立循环固定 `toolExecution="sequential"`，AgentContext 只暴露 consolidate tool。默认限制来自 `MemoryConfig.consolidator`：6 turns、8 次实际 Tool 调用和 60 秒 timeout；达到限制时停止本次运行，但不回滚已经提交的独立操作。

结果分为 `completed/failed/aborted/busy`：

- 模型自然结束，包括零次 Tool 调用，属于 completed。
- Provider error、Tool 未捕获异常、输出截断、timeout、abort 或运行限制不推进 cursor。
- Tool 返回的安全业务 rejected 仍可由模型继续判断，不自动视为 Runtime 失败。
- 只有 completed 才保存 decision.tail；保存失败返回 failed，旧 cursor 保持不变。
- 同一 Runner 已运行时返回 busy，不启动第二个模型循环。

底层异常由 Runner 转换为结构化结果，并调用 `infra/logger`；error/warn 使用 `onTui=true` 进入现有 TUI 通知链路。Runner 不把模型过程事件或完整推理发送到主 EventBus。

`RunResult` 是判别联合：completed 不带 error；failed、aborted 和 busy 必须带稳定 error code/message。共同字段只有 trigger reason、实际 Tool 调用数和 cursorBefore/After，不返回 Prompt、模型文本、Provider 配置或完整推理。

`infra/llm.resolveModel()` 负责组合根的最小模型引用解析：model ref 为 null 时返回调用时传入的当前主模型；显式 `{ provider, id }` 通过 LLMClient 查找。找不到时返回 `model_not_found` Result 并调用 logger，不静默回退。该 helper 不读取 config、`.env` 或凭证。

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

#### 3.6.1 领域边界

操作留痕与触发领域只负责三件事：

1. 从当前 session 的 `memory-events.jsonl` 读取尚未审视的操作历史。
2. 保存已审视到的日志行位置。
3. 根据操作数量、容量压力或主模型请求计算是否应该触发巩固。

该领域不负责：

- 启动或调用 LLM。
- 构造 Consolidator Prompt。
- 调用 consolidate tool。
- 执行 refine/merge。
- 管理模型循环、并发、重试或超时。
- 判断一次模型审视是否成功。

这些运行时职责由后续 Consolidator Runtime 承担。Trigger 只返回决定，不产生副作用；Runtime 成功完成一次审视后，才通知 History 推进游标。

#### 3.6.2 History、Cursor 与 Trigger

三个部分保持简单分工：

```text
history.ts
├── 读取 memory-events.jsonl
├── 投影安全的主模型操作历史
└── 读取/推进 memory-cursor.json

trigger.ts
├── 接收当前 L1 snapshot
├── 接收游标后的安全历史
├── 接收可选主模型请求
└── 返回 trigger decision 或 null
```

- History 属于 Infra Storage，处理文件格式、物理行号和持久游标。
- Trigger 属于 Memory 领域，是不读取文件、不调用模型的纯函数。
- 当前 Markdown snapshot 始终是事实状态；History 只是整理参照。
- Event Logger 是 best-effort，历史缺失只能降低计数触发灵敏度，不能改变 Memory 正确性。
- 游标只表示共享 `memory-events.jsonl` 已审视到哪一行，不分别绑定 `memory.md` 或 `user.md`。
- `memory-cursor.json` 只保存 `{ "line": number }`，不保存状态机、运行 ID、模型结果或错误。
- History 使用 `readCursor()` 和 `saveCursor(line)` 管理游标；缺失文件返回 0，内容损坏时明确报错。
- `saveCursor()` 禁止回退或超过当前日志尾行；相同行号不写盘，变化时通过同目录临时文件原子替换。
- 旧 `agent/memory/events/journal.ts` 和 `checkpoint.ts` 的 schema、seq 与运行状态不进入当前实现。

#### 3.6.3 触发规则

`consolidator/trigger.ts` 使用纯函数 `checkTrigger(input)`，按以下优先级返回决定：

1. `main_request`：主模型显式请求整理。
2. `capacity_pressure`：有新的有效主模型记录，且任一非空文件达到容量比例。
3. `operation_threshold`：游标后主模型 committed 操作达到数量阈值。

默认配置为 20 次 committed 操作和 0.85 容量比例，调用方可以覆盖。noop、rejected 和 Consolidator 操作不累计操作阈值。两个 L1 文件都没有 entry 时，任何信号都不触发。

容量触发要求 History 中至少有一条有效主模型记录，避免损坏行、空行或一次零 Tool 审视后的固定容量比例反复启动模型。主模型显式请求不受该条件限制，由 Runtime 在消费请求后清除请求信号。

Trigger Decision 只包含：

- `reason`。
- 审视前 `cursor` 和本次覆盖的 `tail`。
- 安全 History records。
- 当前 memory/user usage。
- 容量压力涉及的 files；其他 reason 返回空数组。

Trigger 不推进 cursor。后续 Runtime 成功完成审视（包括零次 Tool 调用）后保存 `tail`；失败、中断或超时时保持旧 cursor。

#### 3.6.4 命名约定

该领域利用文件和模块上下文保持命名简洁：

- 优先使用 `history`、`records`、`cursor`、`line`、`tail`、`config`、`input` 和 `decision`。
- 类型名只补充区分职责所需的上下文，不重复堆叠 Memory/Consolidation/Operation 等前缀。
- 不为缩短长度使用难懂缩写。

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

### 3.8 Memory 核心收尾边界

原领域 6“运行时集成”和领域 7“模块收敛”合并为一次 Memory 核心收尾，避免继续按底层细节拆分。该阶段完成后，新 Memory 实现应具备可供主 Agent 直接使用的完整后端闭环：

```text
当前 session
-> L1 Prompt 渲染
-> 主 memory Tool / MemoryService
-> memory:changed
-> 下一次推理前刷新 System Prompt
-> Trigger / Consolidator Runtime
-> session 切换隔离
```

核心收尾包含：

- 最小 L1 Prompt renderer。
- session 级 Repository、History、Service、Runner 和 Trigger coordinator 装配。
- 主 memory Tool、Event Logger、`memory:changed` 和主 Agent Loop 接线。
- `memory/index.ts` 公共出口。
- 组合根迁移，以及无引用旧 Memory 接线、重复类型和过时文案清理。
- 最小离线集成测试与全仓回归。

核心收尾不包含：

- TUI 的 Memory 展示、主动整理入口、运行状态或错误交互。
- 后台任务队列、自动重试失败命令或复杂运行状态机。
- L2-L4、跨 session 自动共享或外部 Memory Provider。

Consolidator 在主推理边界内受限运行，不作为后台服务。主模型 add 因容量不足失败时只请求一次整理；整理后由主模型根据原 Tool Result 决定是否重试，不自动重放旧命令。

最小 L1 renderer 必须包含在本阶段：只调用 `PromptBuilder.invalidate()` 无法更新同一 ReAct run 已构造的 `AgentContext.systemPrompt`。Runtime 需要在下一轮推理前重读当前 snapshot、重建 Memory block，并通过 `prepareNextTurn` 返回更新后的 context。

TUI 接入在 Memory 核心闭环验证完成后单独从上到下设计，届时再根据真实交互调整后端接口。

## 4. 目录结构

```text
vivlos/agent/memory/
├── refactor.md
├── index.ts
├── types.ts
├── security.ts
├── memory.ts
├── consolidate.ts
├── service.ts
├── consolidator/
│   ├── prompt.ts
│   ├── trigger.ts
│   └── runner.ts
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
├── repository.ts
└── history.ts
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

agent/memory/utils/event-logger.ts
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

`agent/memory/utils/event-logger.ts` 负责一次性订阅 `memory:operation`：

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
5. refine/merge Logic、权限、Service 和 Consolidate Tool。
6. History/Cursor、Trigger、Consolidator Config/Prompt/Runner。
7. 领域 0-5 共 144 项测试，提交 `61acd47`。

剩余工作合并为一次核心收尾，不再为内部函数逐项设置 review 闸门：

1. 更新核心收尾边界。
2. 完成最小 L1 renderer 与公共出口。
3. 完成 session Memory runtime 与 Trigger coordinator。
4. 接通主 memory Tool、Event Logger 和 `memory:changed`。
5. 接通主 Agent Loop 的推理前检查与同 run SP 刷新。
6. 收敛组合根和无引用旧 Memory 接线。
7. 先更新集成测试文档并 review。
8. 测试文档获批后补最小离线集成测试。
9. 执行全仓验证、旧引用扫描并提交核心 code review。

核心收尾完成后再进入 TUI 对接，不在本阶段修改 TUI 交互。

## 11. 测试目录

所有测试统一放在 `vivlos/tests/`，不在业务模块内部创建 `test/` 或 `*.test.ts`：

```text
vivlos/tests/
└── memory/
    └── infra.test.ts
```

后续 Memory 层测试继续添加到 `vivlos/tests/memory/`，并按层命名，例如 `service.test.ts`、`logic.test.ts` 和 `snapshot.test.ts`。
