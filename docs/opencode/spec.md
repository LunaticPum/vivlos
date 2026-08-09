# Vivlos 开发上下文与经验总结

> 本文档用于上下文压缩后的恢复参考：记录项目现状、本次会话的工作、关键技术决策与项目编写经验。阅读 [记忆机制](../记忆机制.md)、[memory 规范集](../memory/README.md) 与本文档即可恢复开发上下文。

## 项目概况

Vivlos 是基于 Bun + TypeScript + OpenTUI 的本地通用终端 Agent。核心能力：多模型接入（pi-ai）、工具系统、会话管理、上下文压缩、四层 Memory、Todo/Task、图片识别（多模态）。

- 仓库：`https://github.com/LunaticPum/vivlos.git`，主分支 `master`
- 运行时：Bun 1.3+；测试：`bun run test`（vitest，`bun --bun` 运行时）；类型检查：`bun x tsc --noEmit`
- 代码根：`vivlos/`（entries/agent/infra/shared/tests 分层），文档：`docs/`

## Git 状态（截至本文档写入时）

**已推送的最近提交**（master 与 origin/master 同步）：

```text
e9d23bb feat: 图片识别与模型选择增强
596d157 docs: 完善记忆机制设计与文档表述
0c591a7 feat: L2 会话检索与 Memory 生命周期协调
ea0f7ef chore: 修复 vitest pi SDK alias 与测试脚本，L1 记忆目录归位
```

**待提交改动**（5 个文件，TUI 渲染重构 + 交互细节，本文档写入后随提交一起推送）：

- `useAgent.ts`：LogEntry 新增 `text` 类型（删除 finalText）、`durationMs`（tool 条目 + ConversationTurn）、messagesToTurns 时间戳重算耗时
- `AgentMessageCard.tsx`：时间序部件流渲染、Turn 全宽分割线、工具单行折叠 + 点击展开、FixedScrollBox、/detail 只展开 thinking、流式 sticky 跟随、工具耗时显示
- `ConversationView.tsx` / `ChatPanel.tsx` / `Workspace.tsx`：scrollBottomSignal 发送滚底链路

## 本次会话完成的工作

### 1. L2 会话检索（已提交 0c591a7）

- `MemoryCoordinator`：beforeTurn/afterTurn/sessionDelete 生命周期钩子，失败隔离
- L2 = history.jsonl（权威源）+ memory.db（FTS5 倒排索引，可删除重建）
- 中文分词：CJK 双字展开（`shared/utils/image.ts` 同目录 `layers/l2/tokenize.ts`），解决 FTS5 不分词中文
- `session_search` 工具：AND→OR 降级、片段预算、来源锚点 `sessionId#L行号`
- 侧栏 L2 概览（Sessions/Messages/Indexed）

### 2. 图片识别与模型选择（已提交 e9d23bb）

- 图片附件三通道：拖入终端（=路径粘贴）、直接粘贴路径、Ctrl+G 读剪贴板截图（Windows PowerShell 桥接 `infra/clipboard/image.ts`，存 `.vivlos/temp/`）
- 视觉模型：模型弹窗双击 g 指定（行尾 ◉）、能力标签 `[文本]`/`[文本,视觉]`（pi-ai 的 `model.input` 含 `"image"` 判断）、键入筛选、标题带 provider 名
- 自定义 Provider 的 vision 开关（`provider.ts` 注册时设 `input`）
- 图片轮次整轮用视觉模型（`agent.prompt` 支持 modelOverride）；解析链：指定视觉模型 → 主模型支持图片 → 通知栏拒绝
- rules.md：无附言图片先 offer_choice 询问解析方式

### 3. TUI 时间序部件流重构（待提交）

**数据模型**：`ConversationTurn.log: LogEntry[]` 新增 `text` 类型，删除 `finalText`。thinking/text/tool 按发生顺序交替入 log（文本增量追加到末尾未闭合 text 条目，新 turn/toolCall 会闭合）。会话恢复（messagesToTurns）同步重建有序条目。

**渲染**（AgentMessageCard）：
- 部件按序渲染，每个条目独立成块，只有活跃条目流式刷新
- Turn 分割线：`──── Turn N ─────` 用 `flexGrow + border:["top"]` 拼法自适应全宽；线条浅色 `#6c7086`、标签亮色 `#f5c2e7`；Turn 1 也显示；上方间隔一行（父级 gap 提供，分割线只保留 marginBottom）
- 工具默认单行截断，点击 Calling 行展开；展开内容 ≤8 行纯文本块，>8 行 FixedScrollBox
- `/detail` 只展开 thinking，tool 仅响应单独点击
- 流式 thinking 超 8 行变 scrollBox 后 sticky 跟随底部（`stickyScroll + stickyStart="bottom"`）
- 发送消息强制滚底：Workspace `scrollBottomSignal` 递增 → ChatPanel → ConversationView `scrollTop = scrollHeight`

### 4. 耗时显示与持久化（待提交）

- 工具耗时：tool 条目 `durationMs`，主行显示 `✓ Calling bash 0.5s`；运行时 `toolCall_end` 计算，恢复轮次用 toolResult 时间戳减 assistant 消息时间戳
- 整轮耗时：`ConversationTurn.durationMs` 由 messagesToTurns 用消息时间戳重算（本轮 user 消息 → 最后一条消息），重启后 /detail 底部总耗时不再显示 0s
- **thinking 单条耗时不可恢复**：thinking 与正文共享同一条 assistant 消息的单一时间戳，无法切分；仅运行时实时显示（这是已确认的取舍）

## 关键技术决策与原因

| 决策 | 原因 |
| --- | --- |
| L2 索引用 FTS5 + CJK 双字展开 | FTS5 默认分词器不切分中文；trigram 要求 ≥3 字符查询，双字词是最常见场景 |
| memory.db 与 vivlos.db 分离 | 索引是纯派生数据，可删除重建，不与配置/凭证混存 |
| 图片走 base64 内联（4MB 上限） | pi-ai 的 ImageContent 只支持 base64；history.jsonl 膨胀问题记录在案、后续优化 |
| Ctrl+G 读剪贴板而非 Ctrl+V | 终端 Ctrl+V 只传文本，截图位图传不进来；PowerShell `Clipboard.GetImage()` 桥接 |
| 展开内容 ≤8 行纯文本块、>8 行才 scrollBox | ScrollBox 内部 content 容器强制 `minHeight:"100%"`，maxHeight 自适应会占空行；纯文本块无此问题 |
| 分割线用 border 拼法而非 markdown hr | 效果一致且可控（标签居中、颜色分开） |
| 边框文本化（┆ 前缀）尝试后回退 | 丢失 thinking 的 markdown 渲染，观感降级；滚动时 ┆ 偶发延伸的伪影是 OpenTUI 脏区问题，暂挂起 |
| 视觉模型不做指定时校验 | token-plan 类 provider 的 403 是偶发，用户确认不修 |

## 项目编写经验与认识

### OpenTUI 布局坑

1. **ScrollBox 不是为自适应限高设计的**：内部四层嵌套（root→wrapper→viewport→content），scrollY 模式 content 容器强制 `minHeight:"100%"`。短内容要限高显示时，先数行数，≤上限用纯文本块，>上限才用固定高度 scrollBox。
2. **鼠标事件沿父链冒泡**：`processMouseEvent` 逐层上传直到 `propagationStopped`。嵌套 scrollBox 要拦截滚轮时，在内层 `onMouseScroll` 里 `stopPropagation()`（先判断 `scrollHeight > height`，不可滚动时放行）。
3. **scrollbox 默认可聚焦**：点击会抢焦点，之后 ↑↓ 触发其内置键盘滚动。不需要键盘滚动的 scrollbox 一律 ref 设置 `focusable = false`。
4. **stickyScroll 语义**：只在"已处于底部"时跟随新增内容；用户上翻后不会拉回，需要强制 `scrollTop = scrollHeight`。
5. **border 属性是 Box 专属**：不在 RenderableOptions 里，markdown 等渲染器挂不了 border。
6. **边框绘制 pass 在滚动时有脏区残留伪影**（┆ 偶发延伸），未解决，暂接受。

### 数据流与状态

7. **TUI 状态是运行时态**：ConversationTurn 在内存，重启靠 messagesToTurns 从 history.jsonl 重建。需要跨重启保留的展示数据（如耗时），优先用消息时间戳重算，而不是往消息内容里塞 UI 字段（会污染发回 LLM 的上下文）。
8. **工具耗时可恢复、thinking 不可**：工具跨两条消息（toolCall→toolResult）有两个时间戳；thinking 与正文共享一条 assistant 消息的单一时间戳。
9. **文本增量流**：末尾是未闭合 text 条目则追加，否则新建；新 turn/toolCall 先闭合旧 text 条目（sealTextEntries）。

### 工程惯例

10. **提交风格**：`feat/fix/docs/chore: 中文描述`，按功能边界拆分提交；纯换行符变化的文件（如 bun.lock）先 `git checkout` 还原再提交。
11. **验证闭环**：每次改动后 `bun x tsc --noEmit` + `bun run test`（当前基线 220 tests）。
12. **文档规范**：面向人的文档用描述性表述，不写提示词式祈使句；英文术语首次出现附中文注释；spec 文档开头放"通俗解释"段。
13. **vitest 配置**：pi SDK 从 node_modules 正常解析（不 alias）；`@vivlos/*` 用正则 alias。测试需要 bun 运行时（`bun --bun vitest`）。

## 已知问题与后续方向

| 项 | 状态 |
| --- | --- |
| 滚动时 ┆ 边框偶发延伸伪影 | 暂挂起（OpenTUI 脏区问题，可试关 viewportCulling 对照） |
| 图片 base64 内联使 history.jsonl 膨胀 | 记录在案，后续可改独立存图 + 引用 |
| L2 Retention / Prune | 未实现 |
| L3 Provider（mem0 等）/ L4 知识库 | 设计完成（见 docs/memory/S3、S4），未实现 |
| 桌面宠物 | 方向已提，细节未讨论 |

## 恢复上下文的快速路径

1. 读本文档 + `docs/记忆机制.md` + `docs/memory/README.md`
2. `git log --oneline -8` 与 `git status` 对照本文档的 Git 状态段
3. TUI 渲染看 `AgentMessageCard.tsx`，数据流看 `useAgent.ts`
4. 验证基线：`bun x tsc --noEmit` + `bun run test`（220 tests）
