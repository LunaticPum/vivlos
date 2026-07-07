未折叠的推理过程：
╭── vivlos ──────────────────────╮
│ ┌── 推理过程 ───────────────┐ │ <- 推理过程的文本框是绿色的
│ │ ✓ Thinking... │ │
│ │ ╰─> context line │ │
│ │ ✓ Thinking... │ │
│ │ ╰─> context line │ │  
│ │ ⠋ Thinking... │ │ <- 每轮的 Thinking 追加到此处
│ │ ╰─> context line │ │
│ │ ─────────────────────────│ │ ← 分隔线
│ │ ✓ Calling bash │ │ ← tool 追加在下面
│ │ ╰─> partial result │ │
│ │ ⠋ Calling grep │ │ ← 多个 tool 继续追加
│ │ ╰─> matched 3 lines │ │
│ └──────────────────────────┘ │
╰────────────────────────────────╯

最终:
╭── vivlos ─────────────────────╮
│ ┌── 推理过程 ────────────────┐ │
│ │n Turns n Tools 耗时 \_m_s │ │
│ └───────────────────────────┘ │
│ 这是最终回复文本... │
╰────────────────────────────────╯

现在只有一些简单的问题：

1. 推理文本框没有显示正常；
2. 中间的分割线不要用浅灰色样式，要和文本框一个颜色；
3. 你把thinking和calling tool用不同的颜色区分这点很好（前者绿色，后者紫色）
4. 有些thinking和toolCalling没有显示result或文本，或者有些thinking他就没有变成打勾的样式，这里你看一下是不是调整一下事件刷新的时机和方案比较好
   目前测试的效果如下：
   ╭── vivlos ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
   │ ┌── 推理过程 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
   │ │ ✓ Thinking... │ │
   │ │ ╰─> 用户想让我分析一下当前项目。让我先看看项目结构和关键文件。 │ │
   │ │ ✓ Thinking... │ │
   │ │ ╰─> Let me look at the root package.json, then explore the packages directory and other key files. │ │
   │ │ ✓ Thinking... │ │
   │ │ ╰─> Now let me look at the vivlos directory and the packages to get a fuller picture. │ │
   │ │ ⠼ Thinking... │ │
   │ │ ⠦ Thinking... │ │
   │ │ ✓ Thinking... │ │
   │ │ ╰─> Now I have a good picture of this project. Let me summarize: │ │
   │ │ │ │
   │ │ This is a project called **vivlos** — a personal AI agent development project. It's built on top of the **pi agent SDK** (`@earendil-works/pi-ai... │ │
   │ │ ──────────────────────────── │ │
   │ │ ✓ Calling ls │ │
   │ │ ╰─> f .env │ │
   │ │ f .env.example │ │
   │ │ ✓ Calling read │ │
   │ │ ✓ Calling ls │ │
   │ │ ✓ Calling read │ │
   │ │ ╰─> # vivlos — 个人 Agent 开发项目 │ │
   │ │ │ │
   │ │ ✓ Calling ls │ │
   │ │ ✓ Calling read │ │
   │ │ ✓ Calling read │ │
   │ │ ╰─> { │ │
   │ │ "name": "@earendil-works/pi-ai", │ │────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
   │ └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
