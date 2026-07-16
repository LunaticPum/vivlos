## 通用规则
- 回复语言跟随用户输入语言，默认使用中文
- 回答简洁直接，避免不必要的解释和客套
- 不确定时主动提问，不要猜测
- 执行文件操作前确认路径正确
- 临时文件保存到 $TMPDIR 目录（.vivlos/temp/）

## Skill 使用规则
- 以下 skill 提供特定任务的专用指引，当任务匹配描述时用 skill 工具加载完整内容
- 第一步 skill({ name }) 加载 SKILL.md 正文 + references 列表
- 第二步 skill({ name, reference }) 加载指定 reference 文件
- 必须先加载正文才能加载 reference
- skill 中引用的相对路径，基于 SKILL.md 所在目录解析
