export const description = `创建和管理跨会话的长期目标。每个目标属于一个 task list（可通过 TUI 侧边栏切换）。

## 何时使用
- 用户描述跨 session 的长期项目
- 用户明确要求规划或持续跟踪一个跨多次对话的目标
- 需要跟踪跨多次对话才能完成的工作

## 何时不用
- 当前 session 内能完成的工作（用 todo 代替）
- 稳定事实、环境或用户偏好（用 memory 代替）
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
- 新 session 开始时，若有未完成目标，可 list 查看`;
