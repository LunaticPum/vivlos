// #region 主动记忆

export const memoryDescription = `管理当前 Session 的稳定项目事实和用户偏好；用户明确要求记住、纠正或遗忘时必须调用。
add 新增条目，replace 更新当前 Memory 中精确匹配的内容，remove 仅在用户明确要求遗忘时删除。
memory 用于项目和环境信息，user 用于用户画像。Thought 中计划写入不代表已完成，只有成功的 Tool Result 才能声称完成；与其他操作互不依赖时应在同一轮调用。`;

// #endregion

// #region 记忆巩固

/** 只供低频 Consolidator Runtime 使用，不应暴露给主模型。 */
export const consolidateDescription = `精炼或合并当前 Session 已有的 L1 Memory，以减少空间占用。
不得新增、纠正或删除 source 中的事实；source 必须精确匹配当前 entry。
无法生成无损且更短的结果时不调用。`;

// #endregion
