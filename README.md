<div align="center">

# Vivlos

基于 Bun、TypeScript 与 OpenTUI 构建的本地通用终端 Agent。

<p>
  <img src="https://img.shields.io/badge/Bun-1.3%2B-000000?logo=bun&logoColor=white" alt="Bun 1.3+" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/OpenTUI-0.4-1F6FEB" alt="OpenTUI 0.4" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License" /></a>
</p>

</div>

Vivlos 面向希望在终端中使用大模型完成信息检索、文件处理、任务规划和多步骤操作的用户。它将模型调用、工具执行、会话管理、上下文压缩与可控记忆整合在同一个终端界面中，并通过清晰的运行时边界保留本地状态。

> [!IMPORTANT]
> Vivlos 当前处于早期开发阶段，暂未发布稳定安装包。本仓库现阶段仅提供源码运行方式，接口、配置和交互仍可能调整。

## 目录

- [主要能力](#主要能力)
- [快速开始](#快速开始)
- [模型与配置](#模型与配置)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [本地数据](#本地数据)
- [常用命令](#常用命令)
- [项目文档](#项目文档)
- [开发状态](#开发状态)
- [参与开发](#参与开发)
- [许可证](#许可证)

## 主要能力

1. **终端交互界面**：基于 OpenTUI 和 React 构建，支持流式回复、Thinking 展示、Tool Call 状态和请求中止。
2. **多模型接入**：通过 pi-ai 管理模型与凭证，支持切换 Provider 和 Model，并可添加 OpenAI Compatible 或 Anthropic Compatible 服务。
3. **Agent 工具系统**：内置文件读取与写入、Shell、目录浏览、文本搜索和文件查找等基础工具。
4. **Skill 扩展**：按需加载 Skill 指引；内置 Tavily CLI 扩展可用于搜索、网页提取、站点映射、抓取和深度研究。
5. **会话管理**：支持新建、切换、删除、重命名和自动标题，并通过 JSONL 恢复历史消息。
6. **上下文压缩**：支持自动压缩和手动 `/compact`，在长对话中保留关键事实、进度与后续步骤。
7. **Session Memory**：使用 `memory.md` 和 `user.md` 保存当前 Session 的稳定项目事实与用户偏好，包含容量限制、安全扫描和操作记录。
8. **任务规划**：提供结构化 Todo List、状态推进和侧栏查看，并支持交互式选项确认。
9. **本地持久化**：Provider、Model、凭证和自定义服务配置保存在本地 SQLite；Session、Memory 与 Todo 保存在当前工作目录。
10. **运行时控制**：提供重试、最大轮次、Bash 权限和压缩策略等配置边界。

## 快速开始

### 环境要求

- [Bun](https://bun.sh/) 1.3 或更高版本
- 支持现代终端控制能力的终端程序
- 至少一个可用的 LLM Provider API Key

### 获取源码

```bash
git clone https://github.com/LunaticPum/vivlos.git
cd vivlos
bun install
```

### 配置环境变量

PowerShell：

```powershell
Copy-Item .env.example .env
```

Bash：

```bash
cp .env.example .env
```

在 `.env` 中填写需要使用的 Provider：

```dotenv
DEEPSEEK_API_KEY=your-api-key
VIVLOS_DEFAULT_PROVIDER=deepseek
VIVLOS_DEFAULT_MODEL=your-model-id
```

也可以启动 Vivlos 后，在终端界面中选择 Provider、Model 或添加兼容服务。

### 启动

```bash
bun run dev
```

Vivlos 会以执行命令时的目录作为当前 Workspace，并在该目录下创建 `.vivlos/` 运行数据目录。

## 模型与配置

Vivlos 使用 pi-ai 提供模型目录和调用能力。内置 Provider 的可用模型取决于当前 pi-ai 版本与所配置的凭证。

配置来源按职责分为三类：

| 配置来源 | 用途 |
| --- | --- |
| `.env` | Provider API Key、默认 Provider 和默认 Model |
| `<workspace>/.vivlos/config.json` | 重试、压缩、Memory 容量与 Bash 权限等运行参数 |
| `<workspace>/.vivlos/vivlos.db` | 当前模型、凭证、自定义 Provider 和最近使用记录 |

API Key 和本地运行数据不应提交到版本控制。仓库已默认忽略 `.env` 与 `.vivlos/`。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| Runtime | Bun |
| 语言 | TypeScript |
| 终端界面 | OpenTUI、React |
| Agent Loop | pi-agent-core |
| 模型接入 | pi-ai |
| 本地数据库 | `bun:sqlite` |
| 结构化配置 | JSON、YAML、dotenv |
| 测试 | Bun Test、Vitest |

## 项目结构

```text
vivlos/
├── entries/opentui/       # OpenTUI 应用入口与界面
├── agent/
│   ├── loop/              # Agent Loop、重试与终止控制
│   ├── prompt/            # System Prompt 构建与模板
│   ├── session/           # Session 生命周期与历史记录
│   ├── memory/            # Session Memory 与 Consolidator
│   ├── compression/       # 上下文剪枝、摘要与压缩
│   ├── tools/             # Builtin 与 Advanced Tools
│   └── skills/            # Skill 注册与扩展
├── infra/
│   ├── llm/               # Provider、Model 与 Credential
│   ├── storage/           # SQLite、Session 与 Memory 存储
│   ├── eventbus/          # 应用事件总线
│   ├── config/            # 运行时配置
│   └── logger/            # 本地日志
├── shared/                # Result、错误与通用能力
└── tests/                 # 逻辑与集成测试
```

## 本地数据

Vivlos 的运行数据默认位于当前 Workspace 的 `.vivlos/`：

```text
.vivlos/
├── config.json            # Workspace 运行配置
├── vivlos.db              # Provider、Model 与凭证数据
├── logs/                  # 运行日志
└── sessions/
    └── <session-id>/
        ├── history.jsonl  # 对话与 Tool Result
        ├── memory.md      # 项目和环境记忆
        ├── user.md        # 用户偏好
        └── todos.json     # 当前 Todo List
```

Memory 和 Todo 当前均以 Session 为边界，不承诺跨 Session 自动继承。

## 常用命令

```bash
# 启动开发环境
bun run dev

# TypeScript 检查
bun run typecheck

# 运行当前逻辑测试
bun test
```

## 项目文档

模块文档将统一整理到根目录 `docs/`，正文与文件名均使用中文。现有散落文档会作为实现参考，过时内容集中归档并明确标注，不直接作为当前行为说明。

计划整理的主题包括：

- Agent 整体架构与请求生命周期
- 上下文压缩机制
- Session Memory 机制
- Todo 与任务规划机制
- Tool 执行与错误协议
- Prompt 构建系统
- Session 管理与本地存储
- Provider 与 Model 管理
- Skill 扩展机制
- OpenTUI 界面与交互

对应文档完成后，本节将提供可直接跳转的目录链接。

## 开发状态

当前重点是完善本地终端 Agent 的核心闭环，包括模型对话、工具执行、会话恢复、上下文压缩、Memory、Todo 与 Provider 管理。

以下目录或能力仍处于占位、实验或后续设计阶段，不应视为稳定功能：

- QQ 与其他消息入口
- Sandbox 与隔离执行环境
- Delegation 与多 Agent 协作
- Scheduler 与后台任务
- Task 的完整侧栏工作流
- 跨平台安装包与容器部署

## 参与开发

欢迎通过 Issue 讨论问题、功能设计与文档改进。提交修改前建议先说明目标和行为边界，避免在尚未稳定的模块上引入重复抽象。

开发时请保持改动范围清晰，并至少完成相关逻辑验证与 TypeScript 检查。

## 许可证

Vivlos 使用 [MIT License](./LICENSE)。
