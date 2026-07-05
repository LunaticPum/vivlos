import { Container, Text, Loader, Spacer, TUI } from "@earendil-works/pi-tui";

/**
 * 状态区容器。
 *
 * 显示 loading 动画、错误信息、临时提示。
 * 位于聊天区和输入区之间。
 *
 * TODO: 后续完善方向——
 * - 常驻状态行（模型名、token 用量、turn 计数）
 * - loading 动画样式定制（不同场景不同 spinner）
 * - 错误信息带颜色/可折叠详情
 * - 多行错误堆栈渲染
 */
export interface StatusContainer {
	/** 显示加载动画 */
	showLoading(message?: string): void;
	/** 显示错误信息 */
	showError(message: string): void;
	/** 显示临时提示 */
	showHint(message: string): void;
	/** 清空状态区 */
	clear(): void;
	/** 底层 Container（供 index.ts 组装到 TUI） */
	readonly container: Container;
}

export function createStatusContainer(tui: TUI): StatusContainer {
	const container = new Container();
	let loader: Loader | null = null;
	let statusText: Text | null = null;

	return {
		container,

		showLoading(message = "Thinking...") {
			container.clear();
			// TODO: 后续支持自定义 spinner 颜色/style
			loader = new Loader(
				tui,
				(s) => s,
				(s) => s,
				message,
			);
			container.addChild(loader);
			loader.start();
			tui.requestRender();
		},

		showError(message) {
			container.clear();
			// TODO: 后续加红色样式 / 错误图标
			statusText = new Text(`[error] ${message}`, 1, 0);
			container.addChild(statusText);
			container.addChild(new Spacer(1));
			tui.requestRender();
		},

		showHint(message) {
			container.clear();
			statusText = new Text(message, 1, 0);
			container.addChild(statusText);
			container.addChild(new Spacer(1));
			tui.requestRender();
		},

		clear() {
			loader?.stop();
			loader = null;
			container.clear();
			statusText = null;
			tui.requestRender();
		},
	};
}
