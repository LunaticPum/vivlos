/**
 * TUI Slash 命令类型定义
 *
 * 命令通过 CommandContext 回调直接触发 UI 状态变更，
 * 而非返回文本反馈。ChatPanel 创建 ctx 并注入状态回调。
 */

/** 命令执行上下文 -- 由 ChatPanel 创建，注入 UI 回调 */
export interface CommandContext {
	/** 打开模型选择弹窗 */
	openModels: () => void;
	/** 打开供应商选择弹窗 */
	openProviders: () => void;
	/** 打开会话管理弹窗 */
	openSessions: () => void;
	/** 切换推理细节展开/折叠 */
	toggleDetail: () => void;
	/** 打开帮助弹窗（Ctrl+H） */
	showHelp: () => void;
	/** 清空当前会话 */
	clearConversation: () => void;
	/** 新建会话 */
	newSession: () => void;
	/** /rename <name> -- 重命名当前会话 */
	renameSession: (name: string) => void;
	/** /sessions <id> -- 直接切换到指定会话 */
	switchToSession: (id: string) => void;
	/** 通知总线 -- 在 StatusBar 显示一条消息（默认 3s） */
	notify: (message: string, color?: string, duration?: number) => void;
}

/** TUI Slash 命令 */
export interface TUICommand {
	/** 指令名，不带 /（如 "models"） */
	readonly name: string;
	/** 简短描述，用于帮助弹窗 */
	readonly description: string;
	/** 对应快捷键，用于帮助弹窗展示（如 "Ctrl+M"） */
	readonly shortcut?: string;
	/** 执行指令 */
	execute: (ctx: CommandContext, args: string) => void;
}

/** checkCommand 返回值 */
export interface CheckResult {
	/** true = 已识别为指令（已执行或报错），false = 普通消息 */
	handled: boolean;
	/** 未知指令时的错误信息 */
	error?: string;
}
