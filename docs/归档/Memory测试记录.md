# Memory 测试文档

> [!CAUTION]
> 本文档为阶段性测试设计记录，已经归档，不再作为维护中的项目文档。

## 1. 文档目标

本文定义 Vivlos L1 Memory 应验证的外部行为和可靠性要求，用于指导自动化测试编写、代码 review 和长期回归。

文档关注“系统应表现成什么样”，不描述具体函数内部如何实现。测试脚本统一位于 `vivlos/tests/memory/`。

## 2. 测试范围

当前范围：

- session-local `memory.md` 和 `user.md` 持久化。
- 内容安全扫描与主模型/Consolidator 权限。
- 主动记忆 add/replace/remove。
- 巩固记忆 refine/merge。
- Memory Service 的写入、结果、revision、usage 和 Event 编排。
- 只供 Consolidator 使用的 Consolidate Tool 参数、调用和结果边界。
- Memory 操作历史、安全投影、持久游标和低频触发判定。
- Consolidator Config、模型解析、专用 Prompt 和受限 Runtime。

后续接入时补充：

- L1 System Prompt 刷新和 Agent Loop 端到端行为。

不在本文范围：L2-L4 Memory、模型自然语言事实绝对正确性、跨 session 自动共享。

## 3. 可靠性维度

| 维度 | 目标 |
|---|---|
| 有效运行 | 操作产生正确结果，未引用内容不受影响，结果、文件和 Event 一致。 |
| 安全运行 | 越权和危险内容被拒绝，不安全候选不进入 Markdown 或操作日志。 |
| 长期运行 | 重复操作、长序列操作、重启读取和容量压力下不损坏文件或漂移状态。 |
| 可维护运行 | 每项行为有稳定用例编号，失败结果结构化，测试可隔离、可重复、可定位。 |

## 4. 测试原则

- 纯 Logic 测试不访问文件、Security 或 EventBus。
- Service 测试使用临时 session 目录和真实 Repository/EventBus。
- 每个测试独立创建数据，不依赖执行顺序。
- 安全测试只使用合成凭证和 injection 文本。
- expected business failure 必须返回结构化 Result，不应抛异常。
- 文件系统 I/O 异常允许抛出，由上层运行时处理。
- 只有实际 revision 变化时才允许发布 `memory:changed`。
- 单条操作日志损坏属于可隔离历史问题，返回不含原文的 issue 并继续读取。
- Cursor 文件损坏、非法调用参数和 Trigger 配置错误应明确抛出，不伪装成业务 Result。
- Trigger 测试使用纯对象，不读取文件、不调用模型或 Tool。
- Runtime 测试使用 fake StreamFn/Service/History，不连接真实 Provider，不读取 `.env`。
- Runtime 底层错误既要返回结构化状态，也要通过 Infra Logger 进入现有 TUI 通知链路。

## 5. 功能测试

### 5.1 Repository

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-REP-001 | 验证 session 文件按需创建 | 新 session 第一次记忆写入 | 写入前文件可不存在；成功写入后只创建目标文件 | `infra.test.ts` 已覆盖 |
| MEM-REP-002 | 验证 Markdown 可稳定往返 | Agent 多次启动并读取既有 L1 | entry 内容和顺序不变，LF/CRLF 都可读取 | `infra.test.ts` 已覆盖 |
| MEM-REP-003 | 验证容量边界 | L1 接近字符上限 | 超限返回 `capacity_exceeded`，旧文件保持不变 | `infra.test.ts` 已覆盖 |
| MEM-REP-004 | 验证 combined revision | memory 或 user 任一文件变化 | 实际变化生成新 revision；等价规范化内容保持同一 revision | `infra.test.ts` 已覆盖 |

### 5.2 Security 与权限

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-SEC-001 | 阻止 Prompt injection 和控制标记 | 对话诱导 Agent 持久化指令 | 候选被拒绝，返回稳定违规码 | `security.test.ts` 已覆盖 |
| MEM-SEC-002 | 阻止凭证和不可见字符 | 内容包含 API Key、私钥或方向控制符 | 候选被拒绝，原文不进入文件或 rejected Event | Security 与 Service 已覆盖 |
| MEM-SEC-003 | 固定主模型权限 | 主模型执行主动记忆 | 只允许 add/replace/remove | `security.test.ts` 已覆盖 |
| MEM-SEC-004 | 固定 Consolidator 权限 | 巩固模型整理 L1 | 只允许 refine/merge，禁止 add/replace/remove | `security.test.ts` 已覆盖 |

### 5.3 主动记忆 Logic

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-MAIN-001 | 正确新增且抑制重复 | 用户要求记住稳定事实 | 新事实追加；精确重复返回 noop | `memory.test.ts` 已覆盖 |
| MEM-MAIN-002 | 正确执行局部纠正 | 用户纠正一条记忆中的事实片段 | 唯一子串被替换，entry 其他内容保持不变 | `memory.test.ts` 已覆盖 |
| MEM-MAIN-003 | 防止模糊修改 | oldText 在一条或多条 entry 中出现多次 | 返回 `ambiguous_match`，不产生部分修改 | `memory.test.ts` 已覆盖 |
| MEM-MAIN-004 | 正确遗忘完整 entry | 用户明确要求忘记某项事实 | 唯一命中后删除完整 entry，其他 entries 保持不变 | `memory.test.ts` 已覆盖 |

### 5.4 巩固记忆 Logic

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-CON-001 | 精炼完整 entry | L1 条目表达冗长 | 精确 source 在原位置缩短；不得增加字符 | `consolidate.test.ts` 已覆盖 |
| MEM-CON-002 | 合并重叠 entries | 多条记忆表达相关事实 | sources 合并到最早位置，未引用条目顺序不变 | `consolidate.test.ts` 已覆盖 |
| MEM-CON-003 | 防止误选 source | Consolidator 使用子串或过期完整条目 | 返回 `not_found/ambiguous_match`，不修改状态 | `consolidate.test.ts` 已覆盖 |
| MEM-CON-004 | 防止隐式去重或扩写 | newEntry 已存在或没有缩减 | 返回 `duplicate_target/not_reduced` | `consolidate.test.ts` 已覆盖 |
| MEM-CON-005 | 保证输入不可变 | 同一 snapshot 仍被其他流程读取 | command 和 entries 原引用内容保持不变 | `consolidate.test.ts` 已覆盖 |

### 5.5 Memory Service

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-SVC-001 | 验证主动记忆完整提交 | 主模型成功 add/replace/remove | 文件、usage、revision、Result 和 operation Event 一致 | `service.test.ts` 已覆盖 |
| MEM-SVC-002 | 验证巩固动作独立提交 | Consolidator 连续 refine/merge | 每次读取最新 snapshot 并单文件提交 | `service.test.ts` 已覆盖 |
| MEM-SVC-003 | 验证 noop | duplicate add 或内容不变 refine | 不写盘、不发布 changed，revision 保持不变 | `service.test.ts` 已覆盖 |
| MEM-SVC-004 | 验证 Logic rejection | source 缺失、模糊或未缩减 | 返回结构化错误，只发布 rejected operation | `service.test.ts` 已覆盖 |
| MEM-SVC-005 | 验证 Security rejection | 最终候选包含危险内容 | 不写盘；Event 不包含 before/after 或候选原文 | `service.test.ts` 已覆盖 |
| MEM-SVC-006 | 验证 Repository rejection | 写入结果超过 cap | 文件不变，返回当前 usage/revision，不发布 changed | `service.test.ts` 已覆盖 |
| MEM-SVC-007 | 验证 changed 判定 | Logic 声明变化但持久化 revision 未变化 | 最终结果按实际 revision 返回 noop | `service.test.ts` 已覆盖 |
| MEM-SVC-008 | 验证部分成功语义 | 前一个巩固成功、后一个巩固失败 | 前一个结果保留，后一个失败不回滚前序动作 | `service.test.ts` 已覆盖 |

### 5.6 Consolidate Tool

Consolidate Tool 测试只验证 Tool 边界，不重复断言 Logic、Security、Repository
内部规则。测试使用可观测的 fake MemoryService，不访问真实文件系统或 EventBus。

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-TOOL-001 | 限制模型可见操作面 | Consolidator 获得专用工具集 | schema 只允许 refine/merge 和 memory/user；不暴露 add/replace/remove、sessionId、reason 或 source；Tool 不注册到主模型 `createAdvancedTools()` | `consolidate-tool.test.ts` 已覆盖 |
| MEM-TOOL-002 | 正确转换 refine 参数 | 模型精炼一条完整 entry | `old_entry/new_entry` 原样映射为 `oldEntry/newEntry`，file 保持不变并调用 `executeConsolidation` | `consolidate-tool.test.ts` 已覆盖 |
| MEM-TOOL-003 | 正确转换 merge 参数 | 模型合并同一文件中的多条完整 entries | `old_entries/new_entry` 原样映射为 `oldEntries/newEntry`，sources 顺序不变 | `consolidate-tool.test.ts` 已覆盖 |
| MEM-TOOL-004 | 拒绝语义含混参数 | refine/merge 混用 `old_entry` 与 `old_entries` | 返回 `invalid_tool_params`，不回显原始参数，不获取 context，也不调用 Service | `consolidate-tool.test.ts` 已覆盖 |
| MEM-TOOL-005 | 每次调用获取最新上下文 | 同一 Tool 实例在多次模型循环中使用 | 每次有效调用恰好获取一次当前 `MemoryOperationContext`，并原样传给 Service | `consolidate-tool.test.ts` 已覆盖 |
| MEM-TOOL-006 | 完整返回 committed/noop | 模型根据前一次结果决定后续精确 source | 模型可见 JSON 保留完整 before/beforeEntries/after、usage 和 revision，不截断 entry；details 保留结构化 Service Result | `consolidate-tool.test.ts` 已覆盖 |
| MEM-TOOL-007 | 安全返回 rejected | Logic、Security 或容量检查拒绝操作 | 只序列化 Service 已脱敏的错误结构，不包含命令中的 source 或候选内容 | `consolidate-tool.test.ts` 已覆盖 |
| MEM-TOOL-008 | 保持 Tool 无状态 | 连续执行成功、noop 和 rejected 调用 | 每次结果只来自当次 Service Result，不缓存 snapshot、command 或前次终态 | `consolidate-tool.test.ts` 已覆盖 |

### 5.7 History 与 Cursor

History 测试使用临时 session 目录和真实 JSONL/Cursor 文件，只验证历史读取与调度位置，不通过历史重建 Memory 状态。

`memory-events.jsonl` 是 best-effort 历史：未写入的事件无法由 History 重建，只会使操作计数偏低。Markdown 当前状态不受影响；显式请求仍可立即触发，容量压力会在下一条有效主模型记录出现后再次判定。

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-HIS-001 | 稳定读取增量物理行 | session 首次读取、重启或从 cursor 继续 | 文件缺失返回空结果；LF/CRLF、空行和末尾换行不破坏 tail；`read(after)` 只处理 after 后的物理行 | `history.test.ts` 已覆盖 |
| MEM-HIS-002 | 只投影安全主模型历史 | 日志同时包含 main、consolidator 和额外字段 | 只返回 main add/replace/remove 的必要字段；忽略 Consolidator 和未知字段，记录顺序与行号不变 | `history.test.ts` 已覆盖 |
| MEM-HIS-003 | 隔离损坏日志 | JSON 损坏、结构无效或 sessionId 错误 | 返回 `line+code` issue 后继续读取后续有效行；issue 和结果不包含原始损坏文本 | `history.test.ts` 已覆盖 |
| MEM-HIS-004 | 防止 rejected 候选泄漏 | 异常日志给 rejected 操作附带 before/after | History 强制丢弃 before/after，只保留安全错误元数据 | `history.test.ts` 已覆盖 |
| MEM-CUR-001 | 懒创建并稳定读取 cursor | 新 session 尚未审视，或保存相同行号 | 文件缺失返回 0；保存 0 不创建文件；变化时写入单行 `{"line":n}`，重建 History 后可读回 | `history.test.ts` 已覆盖 |
| MEM-CUR-002 | 保证 cursor 单调且不越界 | Runtime 完成审视后推进位置 | 只允许非负安全整数、不能回退、不能超过当前日志 tail；拒绝时旧文件不变 | `history.test.ts` 已覆盖 |
| MEM-CUR-003 | 原子替换并识别损坏状态 | 多次推进或 cursor 文件被截断/加入未知字段 | 成功后不残留临时文件；JSON/结构损坏明确抛错，不静默跳过历史 | `history.test.ts` 已覆盖 |

### 5.8 Trigger

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-TRG-001 | 空 L1 不启动巩固 | 两个文件都无 entry，但存在请求或历史信号 | 所有信号都返回 null，避免无内容模型调用 | `trigger.test.ts` 已覆盖 |
| MEM-TRG-002 | 响应主模型显式请求 | 主模型要求立即整理非空 L1 | 不要求新 History，返回 `main_request`；优先于容量和操作阈值 | `trigger.test.ts` 已覆盖 |
| MEM-TRG-003 | 正确识别容量压力 | 有新有效主模型记录，文件达到边界比例 | `used/cap >= capacityRatio` 的非空文件进入 files；无有效主记录、空文件或比例未达时不触发 | `trigger.test.ts` 已覆盖 |
| MEM-TRG-004 | 正确计算操作阈值 | session 累积主模型 Memory 操作 | 默认第 20 次 committed 触发；noop/rejected 不计数；自定义正整数阈值生效 | `trigger.test.ts` 已覆盖 |
| MEM-TRG-005 | 保持稳定优先级 | 多个触发条件同时成立 | 固定返回 main_request > capacity_pressure > operation_threshold | `trigger.test.ts` 已覆盖 |
| MEM-TRG-006 | 返回完整、安全的 decision | Runtime 准备构造 Consolidator 输入 | 返回 reason、cursor、tail、安全 records、当前 usage 和受压 files，不补充事实或原始日志 | `trigger.test.ts` 已覆盖 |
| MEM-TRG-007 | 拒绝非法配置和区间 | 阈值、比例、cursor 或 record 行范围无效 | 明确抛出稳定错误，不返回可能跳过历史的 decision | `trigger.test.ts` 已覆盖 |
| MEM-TRG-008 | 保持纯函数和无状态 | 相同或不同输入被重复判定 | 不修改 snapshot/history/config；相同输入结果稳定，前次判定不影响后次 | `trigger.test.ts` 已覆盖 |

### 5.9 Config 与模型解析

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-CFG-001 | 提供完整默认配置 | 用户没有创建 config 或未配置 Consolidator | model 为 null；trigger=20/0.85；turn/tool/timeout=6/8/60000；原 Memory limit 不变 | `config.test.ts` 已覆盖 |
| MEM-CFG-002 | 深层合并局部配置 | 用户只覆盖模型、单个 trigger 或运行限制 | 未指定字段保留默认；model provider/id trim 后成对保留 | `config.test.ts` 已覆盖 |
| MEM-CFG-003 | 回退非法配置 | 数值越界、空 model 字段或错误结构 | 各字段独立回退默认；不把 key、baseUrl 或未知字段带入结果 | `config.test.ts` 已覆盖 |
| MEM-MOD-001 | 未配置时跟随当前模型 | model 为 null，主模型在运行期间切换 | 每次解析都返回当次传入的当前主模型，不固定启动默认模型 | `config.test.ts` 已覆盖 |
| MEM-MOD-002 | 解析显式已注册模型 | 用户指定内置或自定义 Provider 的 provider/id | 返回 LLMClient 中精确匹配的 Model | `config.test.ts` 已覆盖 |
| MEM-MOD-003 | 显式模型不存在时安全失败 | Provider 未注册、模型 ID 错误或已移除 | 返回 `model_not_found`，不回退当前模型，并通过 logger 发送 TUI 可见错误 | `config.test.ts` 已覆盖 |

### 5.10 Consolidator Prompt

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-PRM-001 | 固定 Consolidator 职责 | 模型收到独立 system prompt | 明确只允许 refine/merge，禁止新增、纠正、删除、跨文件移动和恢复事实；无安全操作时结束 | `prompt.test.ts` 已覆盖 |
| MEM-PRM-002 | 构造最小完整上下文 | Trigger 启动一次审视 | 只包含最新 memory/user entries、usage、reason/cursor/tail/files 和安全 History records | `prompt.test.ts` 已覆盖 |
| MEM-PRM-003 | 隔离不应暴露的数据 | History 有 issue，主会话有来源消息或 Provider 配置 | Prompt 不包含完整 session、source、issue、主 Tool Result、API Key、Provider 配置或 rejected 候选 | `prompt.test.ts` 已覆盖 |
| MEM-PRM-004 | 转义动态 XML 文本 | entry/reason/before/after 含 `&<>` 或伪 XML 指令 | 所有动态文本转义，受控属性结构不被打断，并提示 Tool 使用解码后的原始 entry | `prompt.test.ts` 已覆盖 |
| MEM-PRM-005 | 保持输入不可变和输出稳定 | 同一 snapshot/decision 被重复构造 | 不修改输入；相同输入生成相同 system/user 文本 | `prompt.test.ts` 已覆盖 |

### 5.11 Consolidator Runner

Runner 测试直接构造确定性的 fake StreamFn，不验证模型自然语言质量。真实自定义 Provider 留到可选端到端验证，不进入默认测试。

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-RUN-001 | 使用最小独立 AgentContext | Runtime 开始一次审视 | 使用当次 Model、最新 Repository snapshot、单条 Prompt 和唯一 consolidate Tool；不包含主 Agent tools/messages | `runner.test.ts` 已覆盖 |
| MEM-RUN-002 | 完成零 Tool 审视 | 模型判断当前 L1 无法安全压缩 | 返回 completed/toolCalls=0，并把 cursor 从 decision.cursor 推进到 tail | `runner.test.ts` 已覆盖 |
| MEM-RUN-003 | 串行执行多次独立 Tool | 模型连续 refine/merge | Tool 顺序调用，使用正确 session/reason context；成功操作独立保留，最终自然结束后推进 cursor | `runner.test.ts` 已覆盖 |
| MEM-RUN-004 | 允许安全业务 rejected 后结束 | Tool 返回 not_found、安全拒绝或 noop | 结果可返回模型继续判断；模型自然结束时 Runtime 可 completed，不把业务 rejected 误判为底层异常 | `runner.test.ts` 已覆盖 |
| MEM-RUN-005 | 隔离 Provider、Tool 和输出错误 | Provider error、Tool 抛错或 stopReason=length | 返回稳定 failed code，不推进 cursor，不回滚前序已提交操作，并调用 logger | `runner.test.ts` 已覆盖 |
| MEM-RUN-006 | 正确处理 timeout 和外部 abort | Provider 运行过久或调用方取消 | 返回 aborted+timeout/aborted，不推进 cursor，并通过 logger 通知 TUI | `runner.test.ts` 已覆盖 |
| MEM-RUN-007 | 强制 turn/tool 限制 | 模型持续调用 Tool 或不结束 | 达到配置限制后返回 run_limit，停止继续运行，cursor 保持旧值 | `runner.test.ts` 已覆盖 |
| MEM-RUN-008 | 防止并发重复审视 | 同一 Runner 首次 run 尚未结束时再次 run | 第二次立即返回 busy，不读取 Repository、不启动 Stream、不推进 cursor | `runner.test.ts` 已覆盖 |
| MEM-RUN-009 | 防止过期 decision | History cursor 已不同于 decision.cursor | 返回 cursor_changed，不读取 snapshot 或启动模型，并通过 logger 发出 warn | `runner.test.ts` 已覆盖 |
| MEM-RUN-010 | 处理 cursor 保存失败 | 模型正常结束但 cursor 文件写入失败 | 返回 cursor_save_failed，旧 cursor 不变；Memory 已提交操作不回滚，并通过 logger 报错 | `runner.test.ts` 已覆盖 |
| MEM-RUN-011 | 保证结果不泄漏运行内容 | completed/failed/aborted/busy 各终态 | 结果只含 status/reason/toolCalls/cursor/error，不包含 Prompt、模型文本、完整推理、Provider 或凭证 | `runner.test.ts` 已覆盖 |
| MEM-RUN-012 | Runner 可重复使用 | 前一次 completed/failed/aborted 后再次运行 | active 状态在 finally 清除，后续 run 可正常开始且不复用上次消息或计数 | `runner.test.ts` 已覆盖 |

### 5.12 Event 与 SP 刷新

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-EVT-001 | 每个终态都有留痕 | committed/noop/rejected 操作 | 发布一条字段完整的 `memory:operation` | `service.test.ts` 已覆盖 |
| MEM-EVT-002 | merge sources 可审计 | Consolidator 合并多个 entries | Event 使用 `beforeEntries` 保存完整 sources | `service.test.ts` 已覆盖 |
| MEM-EVT-003 | changed 只代表真实变化 | noop 或 rejected 操作 | 不发布 `memory:changed` | `service.test.ts` 已覆盖 |
| MEM-EVT-004 | Event Logger 失败隔离 | JSONL 目录不可写 | Memory 成功结果不回滚，错误被记录 | `infra.test.ts` 已覆盖 |
| MEM-SP-001 | 下一次推理使用新 L1 | Memory 成功写入后继续 Agent Loop | 当前 session SP 在下一次推理前刷新 | `runtime-integration.test.ts` 已覆盖 |

### 5.13 Memory 核心收尾集成

本节覆盖当前组合根已经接通的最小闭环。测试使用临时 session、fake LLM 和官方 faux provider，不启动 TUI、不读取 `.env`、不连接真实 Provider。

| ID | 测试目的 | 实际使用场景 | 期望结果 | 自动化 |
|---|---|---|---|---|
| MEM-L1-001 | 渲染双文件 L1 | memory/user 都有条目 | 输出两个文件块、usage 和 XML 转义内容 | `l1.test.ts` 已覆盖 |
| MEM-L1-002 | 空 L1 不残留内容 | 两个文件都为空或删除最后一条 | 返回空字符串，不保留旧条目 | `l1.test.ts` 已覆盖 |
| MEM-INT-001 | 主 Tool 使用当前 session Service | Tool 连续执行 add/replace/remove | 调用当前 session 的新 Service，reasonCode/reason 进入操作上下文 | `runtime-integration.test.ts` 已覆盖 |
| MEM-INT-002 | 同一 Agent Loop 刷新 L1 | 第一轮 memory add，第二轮继续推理 | 第二次模型请求的 systemPrompt 包含新条目 | `runtime-integration.test.ts` 已覆盖 |
| MEM-INT-003 | session 状态隔离 | 切换 session 后再次构造 Runtime | Repository、Memory Prompt 和 cursor 不读取前一 session | `runtime-integration.test.ts` 已覆盖 |
| MEM-INT-004 | capacity request 触发整理 | add 因容量不足失败 | 下一次 prepare 使用 `main_request`，整理完成后消费 request，不自动重放旧命令 | `runtime-integration.test.ts` 已覆盖 |
| MEM-INT-005 | 其他 session changed 不污染 SP | EventBus 发布其他 session 的 memory:changed | 当前 PromptBuilder 不失效 | `runtime-integration.test.ts` 已覆盖 |
| MEM-INT-006 | Logger 只安装一次 | 多次 Memory 操作 | 每条 operation 只追加一行 memory-events.jsonl | `runtime-integration.test.ts` 已覆盖 |

## 6. 长期运行与维护测试

| ID | 测试目的 | 场景 | 期望结果 |
|---|---|---|---|
| MEM-LONG-001 | 重复操作稳定 | 连续执行 duplicate/noop/rejected | 文件和 revision 不漂移，Event 数量可解释 |
| MEM-LONG-002 | 长序列一致性 | 对同一 session 执行大量独立操作 | 每次 snapshot 可解析，usage 与实际文件一致 |
| MEM-LONG-003 | 重启读取一致 | 写入后销毁并重建 Repository/Service | entries、usage 和 revision 与重启前一致 |
| MEM-LONG-004 | 容量压力可恢复 | 写入超限后执行 refine/merge 再重试 | 超限不损坏旧状态；整理后可继续正常写入 |
| MEM-LONG-005 | Tool 长循环无状态漂移 | 同一 Consolidate Tool 连续接收不同 context 和 Service 终态 | 每次调用独立转换和转发，结果与 context 不复用、不串联 |
| MEM-LONG-006 | History 损坏可隔离 | 长期追加中存在空行、坏行和其他 session 行 | 有效后续记录仍可读取，tail 保持物理行语义，问题不泄漏原文 |
| MEM-LONG-007 | Cursor 重启一致 | 保存 cursor 后销毁并重建 History | 新实例读取同一 line，只处理其后的新增日志，不重复审视已完成区间 |
| MEM-LONG-008 | best-effort 缺口不破坏状态 | Event Logger 写入失败导致历史少记 | 操作计数可能延迟；显式请求仍可立即触发，容量在后续有效主记录出现时重判；Markdown 状态不受影响 |
| MEM-LONG-009 | Runtime 长时间运行有界 | 模型持续输出或持续请求 Tool | timeout、turn 和 Tool 三重限制最终结束运行，不无限占用会话资源 |
| MEM-LONG-010 | Runtime 失败后可恢复 | Provider/Tool/cursor 暂时失败后再次触发 | 旧 cursor 允许重试，前序 Memory 提交保持有效，Runner 不残留 active 状态 |
| MEM-MAINT-001 | 测试可独立重复 | 单独运行任一测试文件或重复运行全量测试 | 结果稳定，无共享临时状态和执行顺序依赖 |
| MEM-MAINT-002 | 行为可追踪 | 测试失败 | 可通过用例 ID 定位到功能、风险和对应脚本 |
| MEM-MAINT-003 | Tool 测试保持分层 | 测试参数与结果适配 | 使用 fake Service 验证调用契约，不通过 Tool 重复测试 Repository/Security 实现 |
| MEM-MAINT-004 | History/Trigger 测试保持分层 | 验证日志格式和触发规则 | History 使用临时文件；Trigger 只使用纯对象；两者都不启动 Runtime 或模型 |
| MEM-MAINT-005 | Runtime 测试保持离线 | 验证 Context、Loop 和错误终态 | 使用 fake StreamFn/Service/History；默认测试不依赖网络、`.env`、API Key 或具体 Provider |

## 7. 通过标准

- 所有已实现领域的高风险用例必须自动化并通过。
- 全量测试、TypeScript typecheck 和 `git diff --check` 必须通过。
- expected business failure 不得产生未捕获异常或部分写入。
- unsafe candidate 不得进入 Markdown 或 rejected Event。
- noop/rejected 不得改变 revision 或发布 `memory:changed`。
- committed 操作的文件、usage、revision、Result 和 Event 必须一致。
- Consolidate Tool 不得进入主模型工具集，也不得允许模型伪造操作上下文。
- Tool 返回的完整 entry、usage 和 revision 不得因展示格式而截断或丢失。
- History issue 不得保存损坏行、跨 session 行或 rejected 候选原文。
- Cursor 只能在成功审视后由 Runtime 推进；Trigger 本身不得读写 cursor。
- Trigger 必须保持请求、容量、操作阈值的固定优先级，且不得在空 L1 上启动模型。
- 未配置 Consolidator model 时必须使用当次当前主模型；显式模型不存在时不得静默回退。
- Runtime AgentContext 只能暴露 consolidate Tool，且所有底层失败必须结构化并进入 Infra Logger。
- completed 以外的 Runtime 状态不得推进 cursor；已提交的独立 Memory 操作不得因后序失败回滚。
- 长序列和重启测试不得出现无法解析的 Markdown 或状态漂移。

## 8. 执行记录

每次完成一个 Memory 领域后，在对应变更说明中记录：

```text
日期：
代码版本：
执行命令：
通过/失败：
新增覆盖：
已知缺口：
```

本文持续维护测试意图和覆盖状态；具体断言以自动化测试脚本为准。

领域 5 执行记录：

```text
日期：2026-07-27
代码版本：Memory 核心收尾工作树（未提交）
执行命令：bun test；bun run typecheck；git diff --check
通过/失败：152 pass，0 fail，13 files；typecheck 通过；diff check 通过
新增覆盖：Config/Model 6 项、Prompt 5 项、Runner 12 项、L1 2 项、运行链 6 项
已知缺口：真实 Provider 与主 Agent 组合根集成留到领域 6，不进入默认离线测试
```
