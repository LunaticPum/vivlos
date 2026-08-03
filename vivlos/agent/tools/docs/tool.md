# Vivlos Tool 定义规范

本文规定 Vivlos Agent Tool 的 schema、description、参数兼容、执行边界、错误语义和验证方式。后续新增或重构 Tool 时应先按本文设计，再进入实现。

规范以 pi 的生产 Tool 实现为主要参考：

```text
D:\VSProject\Agent\pi\packages\coding-agent\src\core\tools\read.ts
D:\VSProject\Agent\pi\packages\coding-agent\src\core\tools\write.ts
D:\VSProject\Agent\pi\packages\coding-agent\src\core\tools\edit.ts
D:\VSProject\Agent\pi\packages\coding-agent\src\core\tools\bash.ts
D:\VSProject\Agent\pi\packages\coding-agent\src\core\tools\grep.ts
```

## 1. 设计目标

一个 Tool 定义应让模型、运行时和维护者分别得到明确边界：

```text
Schema            模型可见的输入结构和静态约束
Description       Tool 的用途、行为边界和关键业务事实
prepareArguments  已知模型参数表示偏差的最小兼容
execute           操作编排、动态状态校验和结果转换
Domain/Storage    业务不变量、持久化、安全和并发边界
Rules             跨 Tool、跨调用或全局模型行为规则
```

各层不得重复承担其他层的主要职责。

## 2. 标准结构

```ts
const Params = Type.Object(
	{
		path: Type.String({ description: "File path" }),
	},
	{ additionalProperties: false },
);

export function createExampleTool(): AgentTool<typeof Params, ExampleDetails> {
	return {
		name: "example",
		label: "Example",
		description: "Read one example file.",
		parameters: Params,
		async execute(_toolCallId, params) {
			// 动态校验和业务调用
			return {
				content: [{ type: "text", text: "Read example file" }],
				details: { path: params.path },
			};
		},
	};
}
```

定义顺序统一为：

```text
共享字段 schema
-> operation/action 分支 schema
-> Params
-> Static 类型和 Details
-> create Tool
-> execute helpers
-> result/error helpers
```

## 3. Schema 负责输入结构

### 3.1 直接表达真实结构

对象使用 `Type.Object`，数组使用 `Type.Array`，枚举使用 literal union。不得为了方便解析而主动把对象或数组藏进 JSON string。

```ts
const Item = Type.Object(
	{
		content: Type.String({ description: "Task content" }),
		priority: Type.Optional(Priority),
	},
	{ additionalProperties: false },
);

const Items = Type.Array(Item, {
	description: "Items in execution order",
	minItems: 1,
	maxItems: 10,
});
```

错误方式：

```ts
items: Type.String({ description: "JSON encoded item array" });
```

JSON string 会向模型隐藏内部字段，迫使 description 承担 schema 的职责。

### 3.2 静态约束写入 schema

确定且不依赖运行状态的约束应直接写入 schema：

```text
required / optional
literal / enum
integer / number / boolean
minLength / maxLength
minItems / maxItems
minimum / maximum
uniqueItems
additionalProperties
```

不要在 description 中声称一个静态上限，却不在 schema 中声明该上限。

### 3.3 动态约束留在运行时

以下约束依赖当前状态，不能只靠 JSON Schema：

```text
文件或 Session 资源是否存在
序号是否落在当前 List 范围
目标文本是否精确唯一匹配
当前 action 是否符合状态机
用户是否已经完成前置调用
trim 后是否为空或重复
安全扫描、容量、权限和并发规则
```

Schema 可以提供基础防线，但 execute/Domain 必须保留最终校验。

### 3.4 Optional 与 operation/action

pi 的实际实现允许使用单层 `Type.Object + Optional`，再在运行时按 mode/action 收窄。不要为了理论上的完全静态表达，把简单 Tool 强制改成复杂嵌套 union。

适合单层 Object 的情况：

```text
分支数量少
大部分字段共享
条件依赖运行状态
根级 union 会显著增加 schema 复杂度
运行时已经有清晰的 command adapter
```

适合 discriminated union 的情况：

```text
分支输入几乎完全不同
存在清晰且稳定的 operation/action literal
union 能直接消除模型常见误用
目标 Provider 已验证能够正确消费该 schema
```

不要仅为了消除一条简单运行时校验增加多层 `anyOf`。

### 3.5 additionalProperties

对精确修改、嵌套对象和存在相似字段的输入，推荐使用：

```ts
Type.Object(fields, { additionalProperties: false });
```

简单标量 Tool 可以遵从 pi 的宽松 Object 风格，但必须确认额外字段不会改变语义或隐藏模型错误。新 Tool 默认优先封闭；不封闭时应有明确理由。

注意：schema validation 发生在 `execute` 前。对包含敏感文本的 Tool，收紧 schema 前必须确认校验错误不会把完整参数回显到不应出现的位置，也不会破坏现有业务 rejected 语义。

## 4. 字段 Description

字段 description 只说明字段本身：

```text
含义
单位
默认值
位置口径
是否相对或绝对
```

推荐：

```ts
path: Type.String({ description: "Path to the file to read" });
offset: Type.Optional(Type.Number({ description: "Start line, 1-indexed" }));
toOrderNum: Type.Integer({ description: "Final item position after moving" });
```

避免：

```text
在什么用户意图下调用 Tool
完整调用步骤
重复列出兄弟字段
大段 JSON 示例
业务状态机教程
```

## 5. Tool Description

Tool description 面向模型说明 Tool 做什么，不负责重新解释 schema。

简单 Tool 通常使用一到两句：

```text
Read one file and return its contents.
Write content to a file, creating parent directories when needed.
```

复杂 Tool 可以补充 schema 无法表达的关键行为：

```text
operation/action 的职责边界
状态推进方向
精确匹配语义
是否完整覆盖或增量修改
不可逆业务规则
```

Description 不应包含：

```text
字段签名复述
枚举逐项抄写
参数拼装教程
大量调用示例
全局 Tool 使用政策
跨调用的长流程说明
```

pi coding-agent 还提供 `promptSnippet` 和 `promptGuidelines`。Vivlos 当前没有 Tool-owned 等价元数据；跨 Tool 或跨调用规则统一放在：

```text
vivlos/agent/prompt/templates/rules.md
```

例如“推荐一次只调用一个 Tool”“先加载 Skill 正文再加载 reference”属于 Rules，不属于字段 description。

## 6. prepareArguments

`prepareArguments` 只用于已观察到的模型参数表示偏差，并且必须在正式 schema 校验前完成最小转换。

```ts
function prepareArguments(args: unknown): Params {
	if (!isObject(args) || typeof args.items !== "string") {
		return args as Params;
	}

	try {
		const items = JSON.parse(args.items);
		return Array.isArray(items) ? { ...args, items } as Params : args as Params;
	} catch {
		return args as Params;
	}
}
```

允许：

```text
JSON string array -> array
已确认的历史字段表示 -> 当前表示
Provider 明确产生的稳定格式偏差 -> schema 期望格式
```

禁止：

```text
替模型补必填业务内容
猜测 action
description 自动映射为 content
绕过权限或安全校验
在 prepareArguments 中执行副作用
```

转换失败时返回原参数，让正式 schema 产生一致的校验结果。

## 7. Execute 与 Command Adapter

`execute` 保持为薄编排层：

```text
读取运行状态
-> 将 Tool 参数收窄为领域 Command
-> 调用 Domain/Storage
-> 持久化成功后发送 Event
-> 构造 Tool Result
```

action 相关的动态必填可以集中在 command adapter：

```ts
function toCommand(params: Params): Result<Command, ParameterError> {
	switch (params.action) {
		case "add":
			// 检查 add 的动态必填字段
		case "replace":
			// 检查 replace 的动态必填字段
	}
}
```

不要让 execute 重复实现 Domain 已经负责的 trim、去重、安全、容量和持久化规则。

## 8. 错误与 Result

遵从 pi 的基础契约：真正的 Tool 执行失败应抛出 Error/ToolError，由 Agent Loop 标记为失败。

```text
文件不存在
路径非法
权限失败
Tool 前置状态不满足
参数无法转换为合法 Command
```

只有领域正式定义了 rejected/noop 结果时，才把它作为结构化普通 Result 返回。例如 Memory 的安全拒绝、重复事实或容量结果可能被上层 Runner 和 TUI 作为业务状态消费，不应机械改成 ToolError。

区分：

```text
ToolError             Tool 没有完成调用
Domain rejected/noop  Tool 完成调用，但领域决定不提交变更
Success               持久化或读取操作按契约完成
```

错误信息应可行动，但不得泄漏敏感候选、密钥、完整内部路径或不应展示的原始参数。

## 9. Tool Result 与 Details

`content` 面向模型，保持短且明确；`details` 面向 TUI、日志和上层业务，使用稳定结构。

```ts
return {
	content: [{ type: "text", text: "Updated 3 Todo items" }],
	details: {
		operation: params.operation,
		message: "Updated 3 Todo items",
		todoList,
	},
};
```

规则：

```text
只有真实成功后才能声称副作用已完成
模型后续需要最新状态时返回完整 canonical 状态
Details 不依赖解析 content 文本
失败 Result 不伪装成 success
Event 只在成功持久化后发送
```

## 10. 安全边界

Schema 不是文件系统或权限安全边界。涉及路径和敏感文本时，运行时必须再次校验。

路径类 Tool 至少考虑：

```text
绝对路径与相对路径
.. 目录逃逸
目标根目录 containment
符号链接与 realpath
TOCTOU
读写权限
```

例如 Skill reference 必须确认最终目标仍位于当前 Skill 的 `references/` 目录，不能直接信任模型传入的 reference 字符串。

## 11. Execution Mode

只有共享可变状态或严格依赖调用顺序的 Tool 才设置：

```ts
executionMode: "sequential";
```

无共享写状态的独立 Tool 遵从 Agent Loop 默认执行模式。不要把 `sequential` 当作模型调用策略；模型是否同轮调用多个 Tool 由 Rules 指导。

## 12. Review 清单

### Schema

- [ ] 参数是否使用真实对象/数组，而不是主动编码成 JSON string？
- [ ] 静态 min/max、枚举、类型和必填是否写入 schema？
- [ ] 动态约束是否保留在 execute/Domain？
- [ ] Optional 是否合理，还是隐藏了明显且稳定的互斥模式？
- [ ] 是否真的需要 union，目标 Provider 是否验证？
- [ ] 嵌套和修改对象是否应设置 `additionalProperties: false`？
- [ ] schema validation error 是否可能泄漏敏感参数或改变业务终态？

### Description

- [ ] Tool description 是否只说明用途和关键行为？
- [ ] 字段 description 是否简短且只描述字段？
- [ ] 是否重复了 schema、枚举或参数签名？
- [ ] 跨调用规则是否应移入 `rules.md`？

### Runtime

- [ ] `prepareArguments` 是否只做已知表示转换？
- [ ] execute 是否保持薄编排？
- [ ] ToolError 与 Domain rejected/noop 是否正确区分？
- [ ] 敏感内容和路径是否有运行时安全校验？
- [ ] Event 是否只在持久化成功后发送？
- [ ] Session 切换是否重置 Tool 的 Session-local 状态？

### Verification

- [ ] 每种合法 operation/action 是否通过？
- [ ] 缺参、额外字段、错误类型和边界数量是否验证？
- [ ] 动态状态错误是否验证？
- [ ] `prepareArguments` 正常输入和兼容输入是否验证？
- [ ] Tool Result、Details、Event 和持久化状态是否一致？
- [ ] TypeScript、相关测试和 `git diff --check` 是否通过？

## 13. 当前应用原则

后续改造现有 Tool 时按以下策略执行：

```text
先读取真实业务 Command 和调用方
-> 按 pi 风格整理 schema 与 description
-> 不机械追求最复杂或最严格的 schema
-> 保留必要的运行时/Domain 校验
-> 做定向 Tool 验证
-> 再处理下一个 Tool
```

当前批次：

```text
read / write / bash / ls / grep / find
Memory / Consolidate 的参数适配错误语义
```

拆分后的 Todo、Offer Choice 和 Skill 当前作为符合规范的参考实现；Task 等待后续正式重写。
