/**
 * Catppuccin 主题色板
 *
 * 四个口味：Latte（亮色）/ Frappé / Macchiato / Mocha（暗色）
 * 官方色板：https://catppuccin.com
 *
 * 语义映射参考 Catppuccin Style Guide：
 * - text/subtext → 正文/辅助文本
 * - surface → 卡片/面板背景
 * - overlay → 边框/分隔线/占位符
 * - accent colors → 语义色（green=success, red=error, yellow=warning, blue=link, mauve=brand...）
 *
 * 后续 /theme slash command 动态切换：通过 ThemeName 索引取对应色板。
 */

// #region 主题类型

export type ThemeName = "latte" | "frappe" | "macchiato" | "mocha";

/** 语义化色板接口，所有主题口味都符合这个结构 */
export interface ThemeColors {
	// ── 文本 ──
	text: {
		primary: string; // 正文（Catppuccin: text）
		secondary: string; // 辅助文本（Catppuccin: subtext0）
		muted: string; // 暗淡文本（Catppuccin: overlay1）
	};

	// ── 背景 ──
	bg: {
		base: string; // 主背景（Catppuccin: base）
		mantle: string; // 次级面板背景（Catppuccin: mantle）
		crust: string; // 最暗背景（Catppuccin: crust）
		surface0: string; // 卡片/悬浮元素背景
		surface1: string; // 输入框/选中态背景
	};

	// ── 边框/分隔 ──
	border: {
		primary: string; // 主边框（Catppuccin: overlay0）
		secondary: string; // 次级边框（Catppuccin: surface2）
		divider: string; // 分隔线（Catppuccin: overlay0）
	};

	// ── 语义色 ──
	accent: {
		primary: string; // 品牌强调色（Catppuccin: mauve）
		bright: string; // 高亮强调（Catppuccin: pink）
	};

	semantic: {
		success: string; // 成功/完成（Catppuccin: green）
		thinking: string; // 推理/思考（Catppuccin: teal）
		tool: string; // 工具调用（Catppuccin: sapphire）
		toolName: string; // 工具名（Catppuccin: peach）
		error: string; // 错误（Catppuccin: red）
		warning: string; // 警告（Catppuccin: yellow）
	};

	// ── 代码 ──
	code: {
		inline: string; // 行内代码（Catppuccin: sky）
		block: string; // 代码块文本（Catppuccin: green）
	};

	// ── 用户消息 ──
	user: {
		border: string; // 用户消息边框（Catppuccin: blue）
		text: string; // 用户消息文本（Catppuccin: text）
	};
}

// #endregion

// #region 四个主题口味

const latte: ThemeColors = {
	text: {
		primary: "#4c4f69",
		secondary: "#6c6f85",
		muted: "#8c8fa1",
	},
	bg: {
		base: "#eff1f5",
		mantle: "#e6e9ef",
		crust: "#dce0e8",
		surface0: "#ccd0da",
		surface1: "#bcc0cc",
	},
	border: {
		primary: "#9ca0b0",
		secondary: "#acb0be",
		divider: "#9ca0b0",
	},
	accent: {
		primary: "#8839ef",
		bright: "#ea76cb",
	},
	semantic: {
		success: "#40a02b",
		thinking: "#179299",
		tool: "#209fb5",
		toolName: "#fe640b",
		error: "#d20f39",
		warning: "#df8e1d",
	},
	code: {
		inline: "#04a5e5",
		block: "#40a02b",
	},
	user: {
		border: "#1e66f5",
		text: "#4c4f69",
	},
};

const frappe: ThemeColors = {
	text: {
		primary: "#c6d0f5",
		secondary: "#a5adce",
		muted: "#838ba7",
	},
	bg: {
		base: "#303446",
		mantle: "#292c3c",
		crust: "#232634",
		surface0: "#414559",
		surface1: "#51576d",
	},
	border: {
		primary: "#737994",
		secondary: "#626880",
		divider: "#737994",
	},
	accent: {
		primary: "#ca9ee6",
		bright: "#f4b8e4",
	},
	semantic: {
		success: "#a6d189",
		thinking: "#81c8be",
		tool: "#85c1dc",
		toolName: "#ef9f76",
		error: "#e78284",
		warning: "#e5c890",
	},
	code: {
		inline: "#99d1db",
		block: "#a6d189",
	},
	user: {
		border: "#8caaee",
		text: "#c6d0f5",
	},
};

const macchiato: ThemeColors = {
	text: {
		primary: "#cad3f5",
		secondary: "#a5adcb",
		muted: "#8087a2",
	},
	bg: {
		base: "#24273a",
		mantle: "#1e2030",
		crust: "#181926",
		surface0: "#363a4f",
		surface1: "#494d64",
	},
	border: {
		primary: "#6e738d",
		secondary: "#5b6078",
		divider: "#6e738d",
	},
	accent: {
		primary: "#c6a0f6",
		bright: "#f5bde6",
	},
	semantic: {
		success: "#a6da95",
		thinking: "#8bd5ca",
		tool: "#7dc4e4",
		toolName: "#f5a97f",
		error: "#ed8796",
		warning: "#eed49f",
	},
	code: {
		inline: "#91d7e3",
		block: "#a6da95",
	},
	user: {
		border: "#8aadf4",
		text: "#cad3f5",
	},
};

const mocha: ThemeColors = {
	text: {
		primary: "#cdd6f4",
		secondary: "#a6adc8",
		muted: "#7f849c",
	},
	bg: {
		base: "#1e1e2e",
		mantle: "#181825",
		crust: "#11111b",
		surface0: "#313244",
		surface1: "#45475a",
	},
	border: {
		primary: "#6c7086",
		secondary: "#585b70",
		divider: "#6c7086",
	},
	accent: {
		primary: "#cba6f7",
		bright: "#f5c2e7",
	},
	semantic: {
		success: "#a6e3a1",
		thinking: "#94e2d5",
		tool: "#74c7ec",
		toolName: "#fab387",
		error: "#f38ba8",
		warning: "#f9e2af",
	},
	code: {
		inline: "#89dceb",
		block: "#a6e3a1",
	},
	user: {
		border: "#89b4fa",
		text: "#cdd6f4",
	},
};

// #endregion

// #region 主题注册表

export const themes: Record<ThemeName, ThemeColors> = {
	latte,
	frappe,
	macchiato,
	mocha,
};

/** 默认主题 */
export const defaultTheme: ThemeName = "mocha";

/** 获取当前主题色板（后续接 React Context 动态切换） */
export function getColors(name: ThemeName = defaultTheme): ThemeColors {
	return themes[name];
}

// #endregion
