/** Todo Tool 的模型使用规则。 */
export const description = `维护当前 Session 的 Todo List。
- read 读取完整 List。
- write 创建新 List，replace 完整替换已有 List，delete 删除整个 List；新 List 的所有 Item 初始为 pending。
- modify edit/move/insert/delete 处理 Item 内容、位置、增加和删除。
- update 将 Item 推进为 in_progress 或 completed。
- orderNum 以最新 Todo Hint 或 Tool Result 为准；move 和 insert 后其他 Item 自动顺移。
- 只有第一条 pending 可以进入 in_progress，同时最多一个 in_progress。
- completed 不可 edit 或 update，但可以 move 或 delete。`;
