import { Input, Spacer } from "@earendil-works/pi-tui";

/**
 * 输入区容器。
 *
 * 封装 pi-tui Input 组件，提供提交回调。
 * 流式输出期间禁用输入（避免并发 prompt）。
 *
 * TODO: 后续完善方向——
 * - 多行输入（替换 Input 为 Editor 组件）
 * - 输入历史（上/下箭头翻历史）
 * - 自动补全（slash command、文件路径）
 * - Shift+Enter 换行（需 Editor 组件支持）
 * - 输入禁用时的视觉提示（灰色、提示文字）
 */
export interface InputContainer {
	/** 设置提交回调（Enter 时触发） */
	onSubmit: ((value: string) => void) | undefined;
	/** 设置取消回调（Esc 时触发） */
	onEscape: (() => void) | undefined;
	/** 禁用输入（流式输出期间） */
	disable(): void;
	/** 启用输入（流式输出结束后） */
	enable(): void;
	/** 清空输入框 */
	clear(): void;
	/** 底层 Input 组件（供 index.ts setFocus） */
	readonly input: Input;
}

export function createInputContainer(): InputContainer {
	const input = new Input();
	let disabled = false;
	let submitCallback: ((value: string) => void) | undefined;
	let escapeCallback: (() => void) | undefined;

	input.onSubmit = (value: string) => {
		if (disabled) return;
		submitCallback?.(value);
	};

	input.onEscape = () => {
		escapeCallback?.();
	};

	return {
		input,

		get onSubmit() {
			return submitCallback;
		},
		set onSubmit(cb) {
			submitCallback = cb;
		},

		get onEscape() {
			return escapeCallback;
		},
		set onEscape(cb) {
			escapeCallback = cb;
		},

		disable() {
			// TODO: 后续加视觉提示（如输入框变灰、显示 "waiting..." 占位文字）
			disabled = true;
		},

		enable() {
			disabled = false;
		},

		clear() {
			input.setValue("");
		},
	};
}
