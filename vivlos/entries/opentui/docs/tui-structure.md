# OpenTUI 分层架构

## 目录结构

```
vivlos/entries/opentui/
├── main.tsx                 # 入口：createCliRenderer + createRoot
├── App.tsx                  # 顶层布局骨架（Flexbox 分区）
├── tsconfig.json            # TypeScript 配置（jsxImportSource: @opentui/react）
├── hooks/
│   └── useAgent.ts          # 核心桥接：EventBus → React state
├── components/              # 组装层：只负责 UI 逻辑和组件组合
│   ├── StatusBar.tsx        # 顶部状态条（模型名/状态提示）
│   ├── ChatArea.tsx         # 聊天内容区容器
│   ├── AgentCard.tsx        # Agent 响应卡片（替代 AgentStatusBorder）
│   ├── ThinkingList.tsx     # think→tool→think 日志流
│   └── InputBar.tsx         # 底部输入栏 + 发送
└── ui/                      # 样式层：设计决策集中管理
    ├── colors.ts            # 色板（cyan/gray/green/... → hex 值）
    ├── theme.ts             # 间距/边框/字号 token
    ├── primitives/          # 原子组件（带默认样式的 OpenTUI 封装）
    │   ├── VBox.tsx          # box + 默认 borderStyle/padding
    │   ├── VText.tsx         # text + 默认字体颜色
    │   └── VDivider.tsx      # 分隔线
    └── patterns/            # 复合模式（特定场景的样式组合）
        ├── BorderedBox.tsx   # 带标题的边框容器（title + borderStyle + 颜色）
        ├── LogEntry.tsx      # think/tool 日志条目样式
        └── UserMessage.tsx   # 用户消息卡片样式
```

## 分层职责

| 层 | 文件 | 职责 | 禁止 |
|---|---|---|---|
| **组装层** | `components/*.tsx` | 组合 UI 结构、状态绑定、事件处理 | 写 inline style、hardcode 颜色值 |
| **样式层·模式** | `ui/patterns/*.tsx` | 特定场景的预组合样式块 | 处理业务状态 |
| **样式层·原子** | `ui/primitives/*.tsx` | 单个 OpenTUI 组件 + 统一默认样式 | 组合多个组件 |
| **样式层·token** | `ui/colors.ts` `ui/theme.ts` | 所有 hex 值、间距、尺寸定义 | — |

## 依赖关系

```
colors + theme
    ↓
primitives (VBox/VText/VDivider)
    ↓
patterns (BorderedBox/LogEntry/UserMessage)
    ↓
components (AgentCard/ThinkingList/StatusBar/InputBar/ChatArea)
    ↓
App.tsx
    ↓
main.tsx

hooks/useAgent.ts — 独立于 UI 层，与 colors/theme 可并行开发
```

## 实现顺序

| 序号 | 文件 | 说明 |
|------|------|------|
| ① | `ui/colors.ts` `ui/theme.ts` | 色板 + 间距 token，零依赖 |
| ② | `ui/primitives/*.tsx` | 原子组件，依赖 ① |
| ③ | `ui/patterns/*.tsx` | 复合模式，依赖 ② |
| ④ | `hooks/useAgent.ts` | 核心桥接，独立开发 |
| ⑤ | `components/ThinkingList.tsx` | 推理日志，依赖 ③ |
| ⑥ | `components/AgentCard.tsx` | Agent 卡片，依赖 ⑤ + ③ + ④ |
| ⑦ | `components/StatusBar.tsx` `InputBar.tsx` | 简单组件，依赖 ③ |
| ⑧ | `components/ChatArea.tsx` | 聊天容器，组合 ⑥ + ⑦ |
| ⑨ | `App.tsx` | 顶层布局，组合 ⑦ + ⑧ |
| ⑩ | `main.tsx` | 入口，依赖 ⑨ |

## 组件映射（pi-tui → OpenTUI）

| pi-tui（旧） | OpenTUI（新） | 说明 |
|---|---|---|
| `AgentStatusBorder`（300行 ANSI 拼框） | `AgentCard` + `ThinkingList`（~50行 JSX） | Flexbox 自动布局，不再手动算宽度 |
| thinking 文本（`wrapLines` + `truncateToWidth`） | `<markdown>` 组件 | 内置 markdown，不再有 CJK/emoji 截断问题 |
| tool 调用/结果 | `<text>` + `fg` prop | 直接传颜色值 |
| turn 分隔符（手动拼 `─`） | `VDivider` 或 `<box>` 的 border | 原生组件 |
| `BorderedMessage` | `<BorderedBox>` | 原生边框 |
| 输入框（`Text` + 手动键盘处理） | `<input>` 组件 | OpenTUI 原生 input |
| `eventBus.on()` + `tui.requestRender()` | `useAgent` hook → React `setState` | 自动触发重渲染 |

## pi-tui → OpenTUI 关键差异

1. **渲染模型**：pi-tui 是 imperative（`Component.render()` 返回字符串数组），OpenTUI 是 declarative（React JSX → 自动渲染）
2. **事件驱动**：pi-tui 用 `tui.requestRender()` 手动触发重绘，OpenTUI 用 React `setState` 自动触发
3. **布局**：pi-tui 手动算宽度+padding，OpenTUI 用 Yoga Flexbox
4. **组件**：pi-tui 需要手动拼 ANSI 框线，OpenTUI 有 `<box borderStyle="...">`
5. **EventBus 不变**：`useAgent` hook 内部仍然用 `eventBus.on()` 订阅，只是消费端变成 React state
