# Vivlos Agent 设计规格说明

> 日期: 2026-07-03
> 状态: 设计阶段

## 1. 项目概述

### 1.1 目标

基于 pi 的 4 个核心 package（`@earendil-works/pi-ai`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`），封装一个高度定制化的个人 agent——**Vivlos**（强击，出自赛马娘）。

### 1.2 核心原则

- `packages/` 只读，不修改 pi 源码
- `vivlos/` 通过门面层（Facade）封装 packages，注入 Vivlos 特有逻辑
- 依赖方向单向：`adapters → modes → vivlos-core → packages`
- 所有动态资源放在用户或项目配置目录（`~/.vivlos/` 或 `.vivlos/`），静态默认资源在代码内

### 1.3 核心差异化

| 维度 | pi | Vivlos |
|------|-----|--------|
| 定位 | 通用终端编程助手 | 个人定制化 agent |
| 人格 | 单一编程助手指令 | 可切换多人格（coder / general / umamusume / custom） |
| 交互方式 | TUI | TUI（主力）+ 聊天平台（扩展）+ HTTP API |
| 扩展系统 | pi extension | 复用 pi extension，增加 Vivlos 独立扩展目录 |
| 资源管理 | `~/.pi/agent/` + `.pi/` | `~/.vivlos/agent/` + `.vivlos/` + 代码默认 |
| 品牌 | pi / π | Vivlos（赛马娘主题） |

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    Vivlos App                        │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ TUI Mode │  │ Chat Mode│  │  HTTP API Server  │  │
│  │(编程助手) │  │(通用助手) │  │  (聊天后端/扩展)  │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                │              │
│  ┌────▼──────────────▼────────────────▼──────────┐  │
│  │               Vivlos Core                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │ harness  │ │  tools   │ │   session     │  │  │
│  │  │(steer/   │ │(自定义)  │ │   (会话管理)   │  │  │
│  │  │followup) │ │          │ │               │  │  │
│  │  └──────────┘ └──────────┘ └───────────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │  memory  │ │extensions│ │     ...       │  │  │
│  │  │(记忆管理)│ │(扩展系统)│ │  (后续扩展)    │  │  │
│  │  └──────────┘ └──────────┘ └───────────────┘  │  │
│  └────────────────────┬───────────────────────────┘  │
│                       │ import                       │
├───────────────────────┼──────────────────────────────┤
│  ┌────────────────────▼─────────────────────────┐    │
│  │              pi Packages (不动)                │    │
│  │  ┌──────┐ ┌──────┐ ┌────────────┐ ┌───────┐  │    │
│  │  │agent │ │  ai  │ │coding-agent │ │  tui  │  │    │
│  │  │hooks │ │prov. │ │tools/session│ │comps. │  │    │
│  │  └──────┘ └──────┘ └────────────┘ └───────┘  │    │
│  └───────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 2.1 Vivlos Core 组件职责

| 组件 | 职责 | 依赖 pi 的 |
|------|------|-----------|
| **harness** | 人格注入（systemPrompt 函数）、事件钩子控制（模型/工具/行为按模式切换）、steer/followUp 流程编排 | `AgentHarness` 的 hooks、steer()、followUp() |
| **tools** | 注册 Vivlos 专属工具、按模式/人格过滤可用工具、扩展管理工具 | `AgentTool` / `ToolDefinition` |
| **session** | 封装 SessionManager，附加 Vivlos 元数据（personality/mode/platform） | `SessionManager` + `SessionRepo` |
| **memory** | 长期记忆：对话摘要持久化、用户偏好存储、跨 session 上下文检索 | 独立实现 |
| **extensions** | Vivlos 独立扩展目录、manage_extensions 工具让 agent 自写插件 | pi 的 `ExtensionRunner`（复用） |

---

## 3. 项目结构与 Workspace 配置

### 3.1 Workspace

**根 `package.json`：**
```json
{
  "name": "my-agent",
  "private": true,
  "workspaces": ["packages/*", "vivlos"]
}
```

**vivlos/package.json：**
```json
{
  "name": "@vivlos/app",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@earendil-works/pi-agent-core": "*",
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  }
}
```

**vivlos/tsconfig.json（开发阶段）：**
```json
{
  "compilerOptions": {
    "paths": {
      "@earendil-works/pi-agent-core": ["../packages/agent/src/index.ts"],
      "@earendil-works/pi-agent-core/node": ["../packages/agent/src/node.ts"],
      "@earendil-works/pi-ai": ["../packages/ai/src/index.ts"],
      "@earendil-works/pi-coding-agent": ["../packages/coding-agent/src/index.ts"],
      "@earendil-works/pi-tui": ["../packages/tui/src/index.ts"]
    }
  }
}
```

### 3.2 目录结构

```
vivlos/
├── package.json
├── tsconfig.json
├── src/
│   ├── core/                    ← Vivlos Core（门面封装层）
│   │   ├── harness/             → steer / followup / hook 编排
│   │   ├── tools/               → 自定义工具注册 + 扩展管理工具
│   │   ├── session/             → 会话管理封装（附加 Vivlos 元数据）
│   │   ├── memory/              → 长期记忆
│   │   ├── extensions/          → Vivlos 扩展系统（复用 pi ExtensionRunner）
│   │   ├── config.ts            → VivlosConfig（目录路径 + 资源加载）
│   │   └── index.ts
│   ├── modes/
│   │   ├── tui/                 → 编程助手模式（TUI）
│   │   └── chat/                → 通用助手模式（聊天平台）
│   ├── adapters/
│   │   ├── http-server/         → HTTP API 服务
│   │   └── chat-gateway/        → 通用消息接入层
│   ├── config/
│   │   ├── defaults/            ← 静态默认资源（随版本发布）
│   │   │   ├── personalities/   → 默认人格（coder / general / vivlos）
│   │   │   ├── themes/          → 默认主题
│   │   │   └── prompts/         → 默认提示词模板
│   │   └── brand.ts             → 品牌 / Vivlos 形象
│   └── entries/
│       ├── tui.ts               → TUI 启动入口
│       ├── chat.ts              → 聊天平台启动入口
│       └── server.ts            → HTTP API 启动入口
└── test/
```

### 3.3 开发工作流

```bash
# 构建所有 package（首次或依赖变更后）
npm run build -ws

# 开发 Vivlos
npm run dev  # → tsx vivlos/src/entries/tui.ts
```

---

## 4. Vivlos Core 组件详细设计

### 4.1 harness — 外层引导核心

封装 pi 的 `AgentHarness`，利用以下 hook 机制注入 Vivlos 行为：

| hook | Vivlos 用途 |
|------|------------|
| `systemPrompt`（函数） | 每次 turn 动态生成：基础人格 + 品牌信息 + 模式约束 + memory 上下文 |
| `before_provider_request` | 聊天模式用低价模型，TUI 保持用户选择 |
| `before_agent_start` | 注入人格特定开场 |
| `tool_call` | 按人格过滤可用工具（如 general 人格禁 bash） |
| `session_before_compact` | 自定义压缩策略 |
| `steer()` | 聊天平台实时打断转向 |
| `followUp()` | 排队追加后置任务 |

```typescript
class VivlosHarness {
  private personality: Personality;
  private mode: VivlosMode;
  private agentHarness: AgentHarness;
  
  buildSystemPrompt(): string {
    // 每次 turn 实时求值，人格切换后自动生效
    return [
      this.personality.systemPrompt,
      this.getBrandContext(),
      this.getModeConstraints(),
      this.memory.getContextForPrompt(),
    ].join("\n\n");
  }
  
  onBeforeProviderRequest(event) {
    if (this.mode === "chat") {
      // 聊天模式用低价模型
    }
  }
  
  onToolCall(event) {
    // 按人格过滤工具
  }
  
  async switchPersonality(personalityId: string): void;
}
```

### 4.2 tools — 自定义工具

```typescript
class VivlosTools {
  private tools: Map<string, AgentTool>;
  
  register(tool: AgentTool): void;
  getToolsForMode(mode: "tui" | "chat"): AgentTool[];
  getToolsForPersonality(personality: Personality): AgentTool[];
}

// Vivlos 内置自定义工具示例
const VIVLOS_TOOLS = {
  manageExtensions: { /* 安装/卸载/重载 Vivlos 扩展 */ },
  switchPersonality: { /* 切换 agent 人格 */ },
  recallMemory: { /* 查询长期记忆 */ },
  savePreference: { /* 保存用户偏好 */ },
};
```

### 4.3 session — 会话管理封装

```typescript
class VivlosSession {
  private sessionManager: SessionManager;
  
  // Vivlos 特有元数据
  metadata: {
    personality: string;       // 当前人格 ID
    mode: "tui" | "chat";      // 运行模式
    platform?: string;         // 聊天平台（wechat/telegram/...）
    channelId?: string;        // 频道 ID
  };
  
  createSession(metadata: VivlosSessionMetadata): Promise<Session>;
  switchPersonality(personalityId: string): Promise<void>;
  transitionMode(newMode: "tui" | "chat"): Promise<void>;
}
```

### 4.4 memory — 长期记忆

```typescript
class VivlosMemory {
  // 采用 pi-chat 的简单模式：markdown 文件持久化
  private memoryDir: string;  // ~/.vivlos/agent/memory/
  
  // 自动捕获：每 N 轮对话或会话结束时生成摘要
  async autoCapture(session: VivlosSession): Promise<void>;
  
  // 检索：加载相关记忆注入 system prompt
  getContextForPrompt(): string;
  
  // 用户偏好
  getUserPreferences(): Promise<UserPreferences>;
  updateUserPreferences(prefs: Partial<UserPreferences>): Promise<void>;
}
```

### 4.5 extensions — Vivlos 扩展系统

```typescript
class VivlosExtensions {
  private extensionsDir: string;  // ~/.vivlos/agent/extensions/
  private runner: ExtensionRunner; // 复用 pi 的 ExtensionRunner
  
  // 加载所有 Vivlos 扩展
  loadAll(api: VivlosExtensionAPI): Promise<void>;
  
  // Agent 自写插件
  installExtension(code: string, name: string): Promise<void>;
  uninstallExtension(name: string): Promise<void>;
  reloadExtension(name: string): Promise<void>;
  list(): ExtensionInfo[];
}
```

---

## 5. 资源管理系统

### 5.1 设计理念

借鉴 pi 的资源管理：**三源合并，按优先级覆盖**。

### 5.2 目录约定

```
~/.vivlos/agent/              ← 用户级（VIVLOS_DIR 环境变量可覆盖）
├── settings.json
├── personalities/            ← 自定义人格
├── themes/                   ← 自定义主题
├── prompts/                  ← 自定义提示词模板
├── sessions/                 ← 会话存储
├── extensions/               ← Vivlos 扩展
├── skills/                   ← 技能
├── memory/                   ← 长期记忆数据
└── auth.json

.vivlos/                      ← 项目级（优先级最高）
├── settings.json
├── personalities/
├── prompts/
├── skills/
└── extensions/

vivlos/src/config/defaults/   ← 静态默认（代码内，随版本发布）
├── personalities/
│   ├── coder.json            ← 编程助手人格
│   ├── general.json          ← 通用助手人格
│   └── vivlos.json           ← Vivlos 角色扮演人格
├── themes/
│   ├── vivlos-dark.json
│   └── vivlos-light.json
└── prompts/
```

### 5.3 加载优先级

```
项目 .vivlos/   >   用户 ~/.vivlos/   >   静态默认 vivlos/src/config/defaults/
   (最高)              (中间)                    (基础)
```

- 同名资源：项目级覆盖用户级，用户级覆盖默认
- 不同名资源：全部合并
- settings.json：深度合并

### 5.4 VivlosConfig 类

```typescript
class VivlosConfig {
  // 目录路径
  static getVivlosDir(): string;       // ~/.vivlos
  static getVivlosAgentDir(): string;  // ~/.vivlos/agent
  
  // 资源加载（三源合并）
  loadPersonalities(): Promise<Personality[]>;
  loadThemes(): Promise<Theme[]>;
  loadPrompts(): Promise<PromptTemplate[]>;
  loadExtensions(): Promise<ExtensionFactory[]>;
  loadSkills(): Promise<Skill[]>;
  loadSettings(): Promise<VivlosSettings>;
}
```

---

## 6. 人格系统与模式切换

### 6.1 人格定义

```typescript
interface Personality {
  id: string;                         // "coder" | "general" | "vivlos" | custom
  name: string;
  description: string;
  systemPrompt: string | ((context: VivlosContext) => string);
  preferredModels: { provider: string; modelPattern: string }[];
  defaultThinkingLevel: ThinkingLevel;
  allowedTools?: string[];
  responseStyle?: "concise" | "verbose" | "humorous";
  theme?: string;
  brandColor?: string;
}
```

### 6.2 预置人格

| 人格 | 适用模式 | 特点 |
|------|---------|------|
| **coder** | TUI | 编程专家，可读写文件，简洁回复，高 thinking |
| **general** | Chat | 通用助手，无文件工具，友好回复，低 thinking |
| **vivlos** | 娱乐 | Vivlos 角色扮演，赛马娘世界观 |

### 6.3 人格切换

人格切换不需要重启 agent——`systemPrompt` 是函数，每次 turn 实时求值。切换 `VivlosHarness.personality` 引用后，下一个 turn 自动生效。

### 6.4 三种 Mode 差异

| | TUI Mode | Chat Mode | HTTP Server |
|---|---|---|---|
| 默认人格 | coder | general | 由请求指定 |
| 默认模型 | 高端（Claude/Codex） | 低价（gpt-4o-mini） | 由请求指定 |
| 工具 | read/bash/edit/write/grep/find/ls | 无文件工具 | 按 API 参数 |
| UI | pi-tui 全功能 | 无（纯文本） | JSON/SSE 响应 |
| steer | Enter 键 | 聊天消息 | API 参数 |
| followUp | Alt+Enter | 平台消息队列 | API 参数 |

---

## 7. Chat Gateway（聊天平台接入）— 后续实现

### 7.1 参考项目

- **pi-chat**（官方）：Discord/Telegram 扩展，直接作为 pi extension 运行。推荐参考其 extension 结构、memory.md 记忆模式、chat_history 工具。
- **pi-agent-chatbot-platform**（社区）：多租户 Web 平台，通过 `pi --mode rpc` + Express WebSocket Bridge 驱动。

### 7.2 整体架构（设计稿）

```
┌──────────────────────────────────────────────────────────┐
│                    Vivlos Chat Gateway                    │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Platform │  │ Platform │  │ Platform │  ...更多平台   │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       │              │              │                     │
│  ┌────▼──────────────▼──────────────▼───────────────┐    │
│  │            Message Normalizer                     │    │
│  │    平台消息 → VivlosMessage（统一内部格式）         │    │
│  └───────────────────────┬───────────────────────────┘    │
│                          │                                │
│  ┌───────────────────────▼───────────────────────────┐    │
│  │              Session Router                        │    │
│  │  按 (platform + channel + sender) 路由到会话        │    │
│  └───────────────────────┬───────────────────────────┘    │
│                          │                                │
│                    VivlosCore                             │
│              (通用助手人格，低价模型)                       │
└──────────────────────────────────────────────────────────┘
```

### 7.3 关键设计决策

- 一个平台频道 = 一个 Vivlos 会话
- 聊天使用通用助手人格，无文件工具，低价模型
- 聊天消息通过 `steer()` 注入 agent，保持连续对话
- 用户可通过聊天命令 `/vivlos switch coder` 切换人格
- 平台 Adapter 作为 Vivlos 扩展加载
- 聊天会话有超时清理机制

### 7.4 Adapter 接口

```typescript
interface ChatPlatformAdapter {
  readonly platform: string;
  start(onMessage: (msg: VivlosChatMessage) => void): Promise<void>;
  stop(): Promise<void>;
  send(response: VivlosChatResponse): Promise<void>;
  sendThinking(sessionKey: string, thinking: boolean): Promise<void>;
  isConnected(): boolean;
}
```

---

## 8. pi 框架深度分析（参考）

### 8.1 四层架构

```
pi-coding-agent  应用层（CLI / SessionManager / Extensions / Skills / Modes）
    ↓
pi-agent-core    Agent 框架（Agent / AgentHarness / steer / followUp / hooks）
    ↓
pi-ai            LLM 抽象层（30+ Provider / 认证 / streaming / TypeBox Tool）
    
pi-tui           TUI 框架（独立，无 pi 依赖）
```

### 8.2 AgentHarness 的 hook 体系

```
                    ┌─ before_agent_start ─── 注入/修改系统提示词和消息
  user prompt ──────┤
                    │   ┌─ before_provider_request ─── 修改 model/headers/transport
  LLM call ─────────┤   ├─ before_provider_payload ─── 直接改请求体
  streaming... ─────┤   ├─ after_provider_response ─── 查看响应状态
  tool call ────────┤   ├─ tool_call ─── 拦截/阻止工具调用
                    │   ├─ tool_result ─── 修改工具结果
  compaction ───────┤   ├─ session_before_compact ─── 自定义压缩策略
                    │   ├─ session_compact ─── 压缩完成通知
  tree navigation ──┤   ├─ session_before_tree ─── 导航前拦截
                    │   └─ session_tree ─── 导航完成通知
  turn end ─────────┤── steer queue drain ── 实时转向
                    │── followUp queue drain ── 排队跟进
```

### 8.3 Extension 系统

pi 的 Extension 是完整的 TypeScript 模块，通过 jiti 运行时加载。可以：注册工具、注册命令、监听生命周期事件、控制 UI（status/widget/footer/header/overlay）、注册快捷键和 CLI 参数。

Extension 就是 `.ts` 文件，agent 可以写代码生成它然后 `/reload` 加载——这就是自写插件的基础。

### 8.4 SDK 入口

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";
const { session } = await createAgentSession({
  model, tools, resourceLoader, sessionManager, authStorage, modelRegistry,
});
```

所有组件可替换，这对 Vivlos 封装至关重要。

---

## 9. 实现计划（概要）

实现顺序按依赖关系排列：

1. **项目基础设施** — npm workspaces 配置，tsconfig，目录结构
2. **VivlosConfig** — 资源管理，目录路径，三源加载
3. **VivlosCore** — harness / tools / session / memory / extensions 核心封装
4. **人格系统** — 预置人格定义，人格切换机制
5. **TUI Mode** — 编程助手模式（封装 pi 的 interactive mode）
6. **HTTP API Server** — REST API + WebSocket
7. **Chat Gateway** — 通用消息接入层 + 平台 Adapter（参考 pi-chat）

---

## 10. 规格自检

- [ ] 无占位符 / TODO
- [ ] 架构与功能描述一致
- [ ] 范围聚焦，可用单个实现计划覆盖
- [ ] 无歧义需求
