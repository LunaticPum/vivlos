export const description = `创建和维护当前会话的 todo 列表，跟踪进度，组织多步骤工作。

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
犹豫时，用它。`;
