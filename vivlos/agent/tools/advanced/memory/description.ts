// #region 主动记忆

export const memoryDescription = `管理长期记忆（memory.md = 项目/环境笔记，user.md = 用户画像）。
实际写盘变更后，下一次模型推理会读取更新后的 Memory context。

## 何时写入
Save: 偏好 / 环境 / 事实 / 纠正 / 约定 / 已完成工作 / 用户显式要求"记住"
Skip: 琐碎问题 / 可搜索的事实 / 原始数据 / session 特有的随机内容

## 操作
- add: 必须提供 file + content + reasonCode；追加条目，重复内容静默 no-op，超 cap 报错
- replace: 必须提供 file + old_text + new_text + reasonCode；old_text 使用唯一 substring 匹配，多条命中报错
- remove: 必须提供 file + old_text + reasonCode；old_text 使用唯一 substring 匹配，多条命中报错
- 无 read：内容已在 system prompt 中

## 规则
- 每条记忆应是一条完整、独立的事实或偏好
- memory.md 存项目/环境/决策经验；user.md 存用户画像/偏好/沟通风格
- 每次操作必须提供 reasonCode：explicit_user_request / explicit_user_forget / user_correction / stable_project_decision / preference_observed
- remove 只用于用户明确要求遗忘，并使用 explicit_user_forget；纠正已有事实应使用 replace
- 调用前按 action 检查必填参数；replace/remove 的 old_text 必须来自当前 Memory 中足够唯一的原文片段
- reason 可选，只写简短、可审计的原因，不要写完整推理
- 超 cap 时优先 replace 精简已有条目，不得为了腾空间擅自 remove
- 写入的条目会进每个未来 session 的 SP，谨慎写入`;

// #endregion

// #region 记忆巩固

/** 只供低频 Consolidator Runtime 使用，不应暴露给主模型。 */
export const consolidateDescription = `整理当前 session 已有的 L1 Memory，只优化表达和空间占用。

## 操作
- refine：精炼一条完整 entry；old_entry 必须与当前文件中的一条 entry 精确匹配
- merge：合并同一文件中的多条完整 entries；old_entries 至少两条且每条都必须精确匹配
- new_entry 始终是整理后的完整最终 entry
- 没有可安全整理的内容时，不调用工具并结束

## 责任边界
- 只能使用 refine/merge，不能 add/replace/remove，也不存在 noop action
- 必须保留 source 中已有事实，不得新增、推断、纠正或删除独立事实
- 不得解决事实冲突、判断事实过时、恢复已删除内容或改变 memory/user 归属
- 无法确认能否无损整理时保持原文，不调用工具

## 执行规则
- refine 后内容长度不能增加；merge 后必须短于 sources 内容长度总和
- 每次调用独立读取最新状态并提交，前一次成功不会因后一次失败而回滚
- 使用工具返回的完整 before/after、usage 和 revision 判断是否继续
- source 已变化或匹配不唯一时，不尝试模糊覆盖`;

// #endregion
