# Vivlos 长期任务清单

> 三大长期目标：Tool 补全 / Memory 四层体系 / SideBar 侧边栏
>
> 详细架构分析见 [架构.md](./架构.md)
>
> 设计原则：tool description 即 skill，不单独写 SKILL.md

---

## Phase 1: Tool 补全

> 底层基础设施，SideBar 和 Memory 的前置依赖。

### 1.0 Session 存储目录化（前置）

当前 `~/.vivlos/sessions/<sessionId>.jsonl` 扁平结构改为目录：

```
~/.vivlos/sessions/
  <sessionId>/
    history.jsonl    # 对话记录（保持 JSONL，增量 append）
    todos.json       # session 级 todo（todo tool 写入）
    meta.json        # session 元数据（name, createdAt, modelId）
```

- [ ] SessionManager: `filePath` 改为 `dirPath + "/history.jsonl"`
- [ ] jsonl-repo.ts: 路径适配
- [ ] 迁移已有 session 文件到新结构（启动时检测旧格式自动迁移）
- [ ] meta.json 读写（session name / modelId / createdAt）

### 1.1 todo tool -- 全量替换，session 级

参照 opencode `todowrite`。agent 每次传入**整个列表**替换，不做增量操作。

**为什么全量替换**：todo 是 session 内的，agent 有完整上下文，列表小（3-7 项），全量发送无负担。避免增量操作的 state 同步问题。

**存储**：`~/.vivlos/sessions/<sessionId>/todos.json`

```typescript
interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority?: "high" | "medium" | "low";
}
// Tool 参数：整个列表
{ todos: Todo[] }
```

- [ ] 类型定义：`Todo`
- [ ] 存储层：读写 `sessions/<sessionId>/todos.json`（全量替换）
- [ ] tool 实现：接收完整列表 -> 写盘 -> emit 事件 -> 返回列表 JSON
- [ ] EventBus 事件：`todo:updated { sessionId, todos: Todo[] }`
- [ ] 注册到 tool registry
- [ ] session 切换时 SideBar 加载对应 todo 列表

**Tool description**（嵌入 tool 定义，注入 SP）：

```
创建和维护当前会话的 todo 列表，跟踪进度，组织多步骤工作。

## 何时使用
- 任务需要 3+ 个不同步骤
- 非简单工作，受益于规划
- 用户给出多个任务（编号或逗号分隔）
- 新指令到达时捕获为 todo
- 开始一个任务 -> 标记 in_progress（同时只有一个）
- 完成一个任务 -> 标记 completed，发现的后续工作加为新 todo

## 何时不用
- 单一简单任务（<3 步）
- 纯信息查询
- 跟踪无组织价值

## 状态
- pending - 未开始
- in_progress - 正在做（同时只有一个）
- completed - 已完成（含验证）
- cancelled - 不再需要

## 规则
- 实时更新，不要批量标记完成
- completed 只在实际完成（含验证）后标记，不基于意图
- 同时只保留一个 in_progress
- 阻塞时保持 in_progress + 加 follow-up todo 描述阻塞原因
- 每次调用传入完整列表（全量替换）
- 保留用户原始命令（flags、args、顺序）

## 示例
用： "加暗色模式并跑测试" -> 多步骤 + 验证
用： "重构 getCwd -> getCurrentWorkingDirectory" -> grep 发现 15 处
不用："怎么在 Python 打印 Hello World" -> 信息查询
不用："给 calculateTotal 加注释" -> 单一编辑
犹豫时，用它。
```

### 1.2 task tool -- 增量 CRUD，跨 session

与 todo 不同：task 跨 session 持久化，新 session 里 agent 不知道完整列表，全量替换不现实。用增量操作。

**存储**：
```
~/.vivlos/tasks/
  personal.json       # TaskList { name, tasks: Task[], createdAt, updatedAt }
  project-a.json
  .active              # 当前 active list 名称（纯文本一行）
```

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
  createdAt: number;
  completedAt?: number;
}
// Tool 参数
{
  action: "create" | "list" | "complete" | "update",
  // create: { title, description? }
  // list: {}（返回当前 active list 的所有 task）
  // complete: { id }
  // update: { id, title?, description?, status? }
}
```

- [ ] 类型定义：`Task` + `TaskList`
- [ ] 存储层：读写 `tasks/<list-name>.json`，active list 读写 `.active` 文件
- [ ] tool 实现：
  - `create`: 生成 id -> 追加到 active list -> emit 事件
  - `list`: 读 active list -> 返回 JSON
  - `complete`: 找到 task -> 设 status=completed + completedAt -> emit 事件
  - `update`: 找到 task -> 更新字段 -> emit 事件
- [ ] EventBus 事件：`task:created` / `task:updated` / `task:completed`（含 listName + task）
- [ ] TUI 切换 active list（SideBar 操作，不是 tool）
- [ ] 注册到 tool registry

**Tool description**：

```
创建和管理跨会话的长期目标。每个目标属于一个 task list（可通过 TUI 侧边栏切换）。

## 何时使用
- 用户描述跨 session 的长期项目
- 用户明确说"帮我规划..."、"记住这个目标"
- 需要跟踪跨多次对话才能完成的工作

## 何时不用
- 当前 session 内能完成的工作（用 todo 代替）
- 琐碎任务
- 信息查询

## 操作
- create: 创建新长期目标（title + 可选 description）
- list: 列出当前 task list 的所有目标
- complete: 标记目标完成
- update: 更新标题/描述/状态

## 规则
- 目标应是结果导向的（"实现 sidebar 组件"），不是动作导向的（"写代码"）
- 一个主要交付物对应一个目标
- 只在结果真正达成时标记 complete
- 新 session 开始时，若有未完成目标，可 list 查看
```

### 1.3 offer_choice tool -- TUI 交互增强

Agent 输出选择项，TUI 渲染弹窗供用户选择，结果回灌给 agent。

**两个使用场景**：
1. Skill/规则指定需要用户决策（选方案/策略）
2. Agent 需要澄清用户意图（"你指的是哪个？"）

```typescript
// Tool 参数
{
  prompt: string,            // 问题描述/上下文
  choices: string[],         // 选项列表（2-10 个）
  multiple?: boolean         // 是否允许多选（默认 false）
}
// 返回：用户选择的选项文本
```

- [ ] tool 实现：execute 返回 Promise -> emit `offer_choice:pending` -> 等待用户选择 -> resolve
- [ ] EventBus 事件：`offer_choice:pending { resolveId, prompt, choices, multiple }`
- [ ] TUI 监听：ChatPanel 监听 `offer_choice:pending` -> 弹出 SelectionPopup -> 用户选择 -> emit `offer_choice:resolved`
- [ ] tool 收到 resolved -> 返回选择结果作为 tool result
- [ ] 复用现有 SelectionPopup 组件
- [ ] 注册到 tool registry

**Tool description**：

```
向用户展示选项并等待选择。适用于需要用户决策或澄清意图的场景。

## 何时使用
- 需要用户在多个方案/策略中选择
- 需要澄清用户意图（"你指的是哪个？"）
- 用户意图不明确，给出可能选项比直接反问更高效

## 何时不用
- 可以直接回答的问题
- 只有一个合理选项（直接做，不要问）
- 选项过多（>10 个）时考虑换一种交互方式

## 参数
- prompt: 问题描述/上下文（必填）
- choices: 选项列表，2-10 个（必填）
- multiple: 是否允许多选（默认 false）

## 规则
- 选项要具体且互斥
- prompt 要说清为什么需要用户选择
- 不要用 offer_choice 替代简单的 yes/no（直接做或直接问）
```

### 1.4 memory tool -- L1 记忆管理

参照 Hermes memory tool，实现 add/replace/remove，无 read（内容已在 SP 中）。

**存储**：`~/.vivlos/memories/memory.md` + `user.md`，用 `---` 分隔条目。

```typescript
// Tool 参数
{
  action: "add" | "replace" | "remove",
  file: "memory" | "user",
  // add: { content }
  // replace: { old_text, new_text }
  // remove: { old_text }
}
```

- [ ] 类型定义：`MemoryAction` + 参数结构
- [ ] 存储层：读写 `memories/memory.md` / `memories/user.md`，`---` 分隔
- [ ] tool 实现：
  - `add`: duplicate 检测 -> cap 检查 -> injection scan -> `---` 分隔追加
  - `replace`: substring 匹配（多条命中报错）-> 替换
  - `remove`: substring 匹配（多条命中报错）-> 删除
- [ ] 安全层：
  - Injection scanning（prompt injection / credential exfiltration / invisible Unicode）
  - 超过 cap 报错（memory.md ~2200 字符 / user.md ~1375 字符，不静默截断）
  - 完全相同内容 add = success no-op
  - substring 多条命中 = 报错逼具体化
- [ ] 注册到 tool registry

**Tool description**：

```
管理长期记忆（memory.md = 项目/环境笔记，user.md = 用户画像）。
内容在 session 启动时冻结进 system prompt，写盘后当前 session 不变，下个 session 才生效。

## 何时写入
Save: 偏好 / 环境 / 事实 / 纠正 / 约定 / 已完成工作 / 用户显式要求"记住"
Skip: 琐碎问题 / 可搜索的事实 / 原始数据 / session 特有的随机内容

## 操作
- add: 追加条目（--- 分隔），重复内容静默 no-op，超 cap 报错
- replace: substring 匹配替换，多条命中报错
- remove: substring 匹配删除，多条命中报错
- 无 read：内容已在 system prompt 中

## 规则
- 每条记忆应是一条完整、独立的事实或偏好
- memory.md 存项目/环境/决策经验；user.md 存用户画像/偏好/沟通风格
- 超 cap 时先 remove 腾空间再 add，不要堆砌
- 写入的条目会进每个未来 session 的 SP，谨慎写入
```

### 1.5 EventBus 事件类型补全

在 `eventbus/types.ts` 新增事件类型：

- [ ] `todo:updated { sessionId, todos: Todo[] }`
- [ ] `task:created { listName, task: Task }`
- [ ] `task:updated { listName, task: Task }`
- [ ] `task:completed { listName, taskId: string }`
- [ ] `offer_choice:pending { resolveId, prompt, choices, multiple }`
- [ ] `offer_choice:resolved { resolveId, selection: string | string[] }`

---

## Phase 2: Memory L1

> 参照 Hermes L1 Markdown Memory，迁移存储 + 补安全 + 接入 Frozen Snapshot。

### 2.1 Markdown 存储层

- [ ] `~/.vivlos/memories/memory.md` - Agent 笔记（`---` 分隔，cap ~2200 字符）
- [ ] `~/.vivlos/memories/user.md` - 用户画像（cap ~1375 字符）
- [ ] 存储接口：`MemoryStore { read(file), write(file, content), getUsage(file) }`
- [ ] 从现有 SQLite 迁移（或并行，逐步切换）
- [ ] 配置项：`memory.characterLimit.memory` / `memory.characterLimit.user`

### 2.2 Frozen Snapshot 集成

- [ ] Session 启动时读 memory.md + user.md -> PromptBuilder freeze
- [ ] 复用已实现的 freeze/getCached/invalidate 机制
- [ ] memory tool 写盘后当前 session SP 不变（靠 tool result 看 live 状态）
- [ ] 下个 session 启动才带上新写入

### 2.3 Memory Update 闭环

- [ ] agent-loop 步骤 9 之后加步骤 10：Memory Update 审视
- [ ] 审视逻辑：Agent 审视本轮对话，按 Save/Skip policy 判断
- [ ] Save: preferences / environment / facts / corrections / conventions / completed work / explicit requests
- [ ] Skip: trivial questions / web-searchable facts / raw data dumps / session-specific randomness
- [ ] 有料则调 memory tool 写盘，无料跳过
- [ ] 可选：用辅助模型做审视（避免主模型 token 浪费）

### 2.4 安全设计完善

- [ ] Cap as Feature：SP header 显示当前用量百分比，超限报错
- [ ] Duplicate = Success No-op：add 完全相同内容静默不插入
- [ ] Injection Scanning：写入前扫描 prompt injection / credential / invisible Unicode
- [ ] substring 匹配：replace/remove 多条命中报错，逼 Agent 写更具体
- [ ] Save/Skip Policy：出厂带策略，注入 SP 的 memory tool 描述中

---

## Phase 3: SideBar 侧边栏

> 参照 opencode 做法，用 opentui SDK 创建侧边栏，4 个 box 分区。

### 3.1 布局架构

- [ ] 左侧固定宽度侧边栏（~30 字符），与 ChatArea 并列
- [ ] 布局：`<box flexDirection="row"><Sidebar /><ChatPanel /></box>`
- [ ] 可选：快捷键切换显示/隐藏（如 Ctrl+B）
- [ ] scrollbox 支持内容溢出滚动

### 3.2 基础信息 Box

- [ ] 会话名（session name 或 id 截断）
- [ ] 操作环境（OS / cwd）
- [ ] 当前时间（实时刷新或冻结在 session 启动时刻）
- [ ] 模型 ID（provider/modelId）
- [ ] 思考强度（reasoning effort，如 applicable）

### 3.3 Agent 信息 Box

- [ ] Memory 用量（memory.md / user.md 字符数 / cap 百分比）
- [ ] 可用 Skills 列表
- [ ] 可用 Tools 列表
- [ ] MCP Server（预留位，暂为空）

### 3.4 Task List Box

- [ ] 监听 EventBus `task:*` 事件，实时刷新
- [ ] 显示长期目标列表（title + status）
- [ ] 状态标记：`[ ]` pending / `[-]` in_progress / `[x]` completed
- [ ] 数据来源：`~/.vivlos/tasks/<active>.json`
- [ ] TUI 操作：切换 active task list（读取 `tasks/` 目录下所有 .json 文件列表）

### 3.5 Todo List Box

- [ ] 监听 EventBus `todo:updated` 事件，实时刷新
- [ ] 显示当前 session 的短期任务
- [ ] 状态标记：`[ ]` pending / `[-]` in_progress / `[x]` done / `~` cancelled
- [ ] session 切换时加载对应 todo 列表
- [ ] 数据来源：`~/.vivlos/sessions/<sessionId>/todos.json`

---

## Phase 4: Memory L2 - Session Search

> 全文检索历史会话，Agent 自主召回。

### 4.1 索引层

- [ ] session JSONL 建全文索引（FTS5 或等效方案）
- [ ] 每次 appendMessage 时同步写入索引
- [ ] auto prune + vacuum（启动时清理过期索引）

### 4.2 session_search tool

- [ ] tool 实现：`session_search <query>` - 全文检索历史会话
- [ ] 返回命中片段（可选辅助模型摘要）
- [ ] Agent 自主调用（不必用户显式 prompt）
- [ ] 注册到 tool registry

---

## Future

### L3: External Provider

- Provider ABC 接口 + plugin loader
- 五件套：inject / prefetch / sync / extract / tools
- 同时只开一个，不迁移数据

### L4: 知识库

- 文件系统 vault，项目级结构化知识
- Bundled skill 形态

### Gateway / Cron

- 多渠道适配（QQ / 微信 / Telegram / ...）
- Session Manager: queue / interrupt / steer
- Cron: 每分钟 tick + jobs.json + Home 通知
