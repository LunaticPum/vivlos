/** 六个 Todo Tool 各自面向模型的职责边界。 */
export const descriptions = {
	read: "读取当前 Session 的完整 Todo List；不存在时返回 missing。",
	write: "创建当前 Session 中尚不存在的 Todo List。传入完整、按执行顺序排列的 Item 数组；所有 Item 初始为 pending。",
	replace: "完整替换当前 Session 已存在的 Todo List。传入新的描述和完整 Item 数组；所有 Item 重新初始化为 pending。",
	delete: "删除当前 Session 的整个 Todo List。删除单个 Item 应使用 todo_modify。",
	modify: "修改当前 Todo List 的 Item 内容和顺序。edit 需要 orderNum，并至少提供 content 或 priority；move 需要 orderNum + toOrderNum；insert 需要 atOrderNum + content；delete 需要 orderNum。completed Item 不可 edit，但可以 move 或 delete。",
	update: "将 Todo Item 单向推进为 in_progress 或 completed。只有第一条 pending 可以进入 in_progress，completed 不可逆。",
} as const;
