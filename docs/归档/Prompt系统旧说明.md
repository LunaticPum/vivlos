# Prompt 系统

> [!CAUTION]
> 本文档为旧版实现说明，已经归档。当前机制请阅读 [智能体运行机制](../智能体运行机制.md)。

## 概述

vivlos 的 system prompt 采用全 XML 格式，每个段落用 XML 标签包裹，内容 tab 缩进。

LLM 可以精确引用某个段落（如"遵循 `<rules>` 中的规则"），段落边界清晰无歧义。

## XML 结构

```
<identity>          -- 角色定义 + skill 使用方式
    ...
</identity>

<environment>       -- 运行环境（动态生成）
    <runtime>Bun 1.2.3</runtime>
    <os>win32</os>
    <cwd>/path/to/project</cwd>
    <timezone>Asia/Shanghai</timezone>
    <time>2026-07-16T14:30:00+08:00</time>
    <language>zh-CN</language>
</environment>

<available_skills>  -- 可用 skill 列表（由 formatSkillsForPrompt 生成）
    <skill>
        <name>tavily-search</name>
        <description>...</description>
        <location>/path/to/SKILL.md</location>
    </skill>
</available_skills>

<memory>            -- 当前 Session 的 L1 Memory（不可信事实数据，空则省略）
    ...
</memory>

<compacted_history> -- 当前 Session 的压缩历史（不可信背景数据，空则省略）
    ...
</compacted_history>

<rules>             -- 行为约束 + skill 使用指引
    - 回答简洁直接
    ...
</rules>
```

段落顺序：`identity -> environment -> available_skills -> memory -> compacted_history -> rules`

`memory` 与 `compacted_history` 只提供背景数据，不是可执行指令，也不能单独证明某项操作已完成。工具职责、结果真实性和 Memory 作用域由静态 `rules` 约束。

## 文件结构

```
prompt/
  docs/
    prompt-system.md    -- 本文档
  templates/
    identity.md         -- <identity> 内容（纯文本）
    environment.md      -- <environment> 模板（带 {{placeholder}} 占位符）
    rules.md            -- <rules> 内容（纯文本）
  builder.ts            -- 加载模板 + 占位符替换 + XML 包裹 + 拼装
  types.ts              -- 类型定义
  index.ts              -- barrel export
```

## 模板文件

### identity.md / rules.md

纯文本内容，builder 用 `wrapXml(tag, content)` 包裹后注入。内容每行加 tab 缩进。

### environment.md

带 `{{placeholder}}` 占位符的模板，builder 在 `build()` 时替换为动态值：

| 占位符         | 值                                | 来源                                               |
| -------------- | --------------------------------- | -------------------------------------------------- |
| `{{runtime}}`  | `Bun 1.2.3` 或 `Node.js v22.19.0` | `process.versions.bun` / `process.version`         |
| `{{os}}`       | `win32` / `darwin` / `linux`      | `process.platform`                                 |
| `{{cwd}}`      | 工作目录绝对路径                  | `process.cwd()`                                    |
| `{{timezone}}` | IANA 时区                         | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| `{{time}}`     | ISO 8601 时间戳                   | `new Date().toISOString()`                         |
| `{{language}}` | BCP 47 语言标签                   | 固定 `zh-CN`                                       |

## builder.ts

### wrapXml(tag, content)

将内容包裹在 XML 标签中，每行加 tab 缩进：

```
wrapXml("identity", "你是 vivlos。\n你可以使用工具。")

=>
<identity>
	你是 vivlos。
	你可以使用工具。
</identity>
```

### build() 流程

1. 加载 identity.md -> `wrapXml("identity", ...)`
2. 加载 environment.md -> 替换占位符 -> `wrapXml("environment", ...)`
3. skills 文本 -> `wrapXml("available_skills", ...)`
4. memory 文本 -> `wrapXml("memory", ...)`（空则跳过）
5. compacted history 文本 -> `wrapXml("compacted_history", ...)`（空则跳过）
6. 加载 rules.md -> `wrapXml("rules", ...)`
7. 用 `\n\n` 连接所有段落

## 如何添加新段落

1. 在 `templates/` 下新建 `xxx.md` 模板文件
2. 在 `builder.ts` 的 `createPromptBuilder()` 中加载模板
3. 在 `build()` 中调用 `wrapXml("xxx", ...)` 并加入 sections 数组
4. 如需动态内容，用 `{{placeholder}}` + `substitute()` 替换

## skills 数据流

```
scanSkillsDir() 扫描 builtin/ + extension/
  -> SkillRegistry 存储 metadata + 路径
  -> formatSkillsForPrompt(registry.list()) 生成 <skill> 条目
  -> promptBuilder.setSkills(text)
  -> builder.build() 包裹 <available_skills>
  -> 注入 system prompt
```

`formatSkillsForPrompt()` 只负责数据（`<skill>` 条目），不负责 XML 包裹和指令文本。
指令文本在 `rules.md` 中，XML 包裹在 `builder.ts` 中。
