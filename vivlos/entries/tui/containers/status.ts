import { Container, Text, Loader, Spacer, TUI } from "@earendil-works/pi-tui";

/** ANSI 前景色简写 */
const fg = {
	blue: (t: string) => `\x1b[34m${t}\x1b[0m`,
	red: (t: string) => `\x1b[31m${t}\x1b[0m`,
	gray: (t: string) => `\x1b[90m${t}\x1b[0m`,
	green: (t: string) => `\x1b[32m${t}\x1b[0m`,
	yellow: (t: string) => `\x1b[33m${t}\x1b[0m`,
};

/**
 * 状态区容器。
 *
 * 显示 loading 动画、错误信息、提示、工具执行状态。
 * loading 用蓝色、error 用红色、hint 用灰色、tool 用绿色/红色。
 */
export interface StatusContainer {
	showLoading(message?: string): void;
	showError(message: string): void;
	showHint(message: string): void;
	showToolRunning(toolName: string): void;
	showToolDone(success: boolean): void;
	clear(): void;
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
			loader = new Loader(tui, (s) => s, (s) => s, fg.blue(message));
			container.addChild(loader);
			loader.start();
			tui.requestRender();
		},

		showError(message) {
			container.clear();
			statusText = new Text(fg.red(`✗ ${message}`), 1, 0);
			container.addChild(statusText);
			container.addChild(new Spacer(1));
			tui.requestRender();
		},

		showHint(message) {
			container.clear();
			statusText = new Text(fg.gray(message), 1, 0);
			container.addChild(statusText);
			container.addChild(new Spacer(1));
			tui.requestRender();
		},

		showToolRunning(toolName) {
			container.clear();
			statusText = new Text(fg.yellow(`> ${toolName} ...`), 1, 0);
			container.addChild(statusText);
			container.addChild(new Spacer(1));
			tui.requestRender();
		},

		showToolDone(success) {
			container.clear();
			const mark = success ? fg.green("✓") : fg.red("✗");
			statusText = new Text(`> ${mark}`, 1, 0);
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