import { Container, Text, Spacer } from "@earendil-works/pi-tui";

/**
 * 工具执行 UI 组件。
 *
 * 参照 coding-agent 的 ToolExecutionComponent，但 P5 阶段做最小解耦实现：
 * - 不依赖 theme / Box / Image / ToolDefinition / 扩展系统
 * - 只依赖 pi-tui 的 Container + Text + Spacer
 * - 对外暴露 start / end 两个生命周期方法
 *
 * TODO: 后续完善方向——
 * - [ ] Box 边框 + 背景色（参照 coding-agent theme.bg("toolPendingBg")）
 * - [ ] 工具参数显示（折叠/展开 args）
 * - [ ] tool_execution_update 流式中间态更新（参照 coding-agent updateResult）
 * - [ ] 结果内容展开/折叠
 * - [ ] 工具图标（✓/✗ 使用颜色 + Unicode 符号）
 * - [ ] 定时器显示（工具运行时长）
 */
export class ToolExecution {
	/** 包裹容器，挂在 chatContainer 里 */
	readonly container = new Container();

	private toolCallId: string;
	private toolName: string;
	private statusText: Text;
	private started = false;
	private finished = false;

	constructor(toolCallId: string, toolName: string) {
		this.toolCallId = toolCallId;
		this.toolName = toolName;

		// TODO: 后续用 Box + 背景色包裹，设置 paddingX/paddingY
		this.statusText = new Text("", 1, 0);
		this.container.addChild(this.statusText);
	}

	/**
	 * 标记工具开始执行。
	 *
	 * 插入一行 "  > toolName ..."
	 */
	start(): void {
		if (this.started) return;
		this.started = true;

		this.statusText.setText(`  > ${this.toolName} ...`);
	}

	/**
	 * 标记工具执行结束。
	 *
	 * 替换为 "  > toolName ✓" 或 "  > toolName ✗"
	 * summary 暂存但 P5 未使用（后续做展开/折叠时需用）。
	 *
	 * TODO: 后续加颜色——✓ 绿色、✗ 红色（chalk 或 ANSI escape）
	 * TODO: 后续加展开/折叠——end 后点击展开显示 summary 内容
	 */
	end(isSuccess: boolean, _summary: string): void {
		this.finished = true;

		const mark = isSuccess ? "✓" : "✗";
		this.statusText.setText(`  > ${this.toolName} ${mark}`);
	}

	/** 清理资源。当前无外部资源需要释放，留作扩展点。 */
	dispose(): void {
		// TODO: 后续如有 timer / update 回调等需在此清理
	}
}
