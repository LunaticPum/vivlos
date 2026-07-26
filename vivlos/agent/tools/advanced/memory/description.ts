export const description = `管理长期记忆（memory.md = 项目/环境笔记，user.md = 用户画像）。
内容在 session 启动时冻结进 system prompt，写盘后当前 session 不变，下个 session 才生效。

## 何时写入
Save: 偏好 / 环境 / 事实 / 纠正 / 约定 / 已完成工作 / 用户显式要求"记住"
Skip: 琐碎问题 / 可搜索的事实 / 原始数据 / session 特有的随机内容

## 操作
- add: 追加条目（--- 分隔），重复内容静默 no-op，超 cap 报错
- replace: substring 匹配替换，多条命中报错
- remove: substring 匹配删除，多条命中报错
- 无 read：内容已在 system prompt 中

## 规则
- 每条记忆应是一条完整、独立的事实或偏好
- memory.md 存项目/环境/决策经验；user.md 存用户画像/偏好/沟通风格
- 每次操作必须提供 reasonCode：explicit_user_request / explicit_user_forget / user_correction / stable_project_decision / preference_observed
- remove 只用于用户明确要求遗忘，并使用 explicit_user_forget；纠正已有事实应使用 replace
- reason 可选，只写简短、可审计的原因，不要写完整推理
- 超 cap 时优先 replace 精简已有条目，不得为了腾空间擅自 remove
- 写入的条目会进每个未来 session 的 SP，谨慎写入`;
