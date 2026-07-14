/**
 * InputBar - 输入栏分区
 *
 * 功能：
 * - <textarea> 多行编辑（Ctrl+Enter 换行，Enter 提交）
 * - 外层 box 高度随内容行数自适应（1~4 行内容，+2 行边框）
 * - 历史消息补全：最近 6 条已发送消息 + 当前草稿 = 7 个导航位
 *   - 光标在第一行按 Up 切上一条历史
 *   - 光标在最后一行按 Down 切回下一条（最终回到草稿）
 *   - 草稿实时同步，包括空状态
 * - 弹窗激活时 blur textarea，让导航键冒泡到弹窗组件
 * - Ctrl+L / Ctrl+P / Ctrl+O 快捷键打开对应弹窗
 * - slash 命令补全：输入 / 开头时实时提示已注册指令，Tab 补全
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type {
	BorderCharacters,
	TextareaRenderable,
	CursorChangeEvent,
	ContentChangeEvent,
} from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { TUICommandRegistry } from "../../commands/registry";
import { KEYBINDS, matchesKeybind } from "../../keybinds";

const C = {
	border: "#cba6f7",
	text: "#cdd6f4",
	subtext: "#a6adc8",
	suggestionBg: "#1e1e2e",
	hint: "#6c7086",
} as const;

const inputBorder: BorderCharacters = {
	topLeft: "─",
	topRight: "─",
	bottomLeft: "─",
	bottomRight: "─",
	horizontal: "─",
	vertical: "❯",
	topT: "─",
	bottomT: "─",
	leftT: "─",
	rightT: "─",
	cross: "─",
};

const MAX_LINES = 4;
const MAX_HISTORY = 6;

export interface InputBarProps {
	/** 提交文本（非指令时触发） */
	onSubmit: (text: string) => void;
	/** Ctrl+C 打断 */
	onEsc?: () => void;
	/** 弹窗是否激活（激活时 blur textarea + 跳过历史导航） */
	popupActive: boolean;
	/** Ctrl+L: 打开模型选择弹窗 */
	onOpenModels: () => void;
	/** Ctrl+P: 打开供应商选择弹窗 */
	onOpenProviders: () => void;
	/** Ctrl+O: 打开帮助弹窗 */
	onShowHelp: () => void;
	/** 命令注册表（用于 slash 补全） */
	registry: TUICommandRegistry;
}

export function InputBar({
	onSubmit,
	onEsc,
	popupActive,
	onOpenModels,
	onOpenProviders,
	onShowHelp,
	registry,
}: InputBarProps) {
	const [contentLines, setContentLines] = useState(1);
	const [inputText, setInputText] = useState("");
	const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);

	// ── 历史消息状态 ──
	// history[0] = 最新，history[5] = 最旧；historyIdx = -1 表示草稿
	const historyRef = useRef<string[]>([]);
	const historyIdxRef = useRef(-1);
	const draftRef = useRef("");

	// ── 光标位置 ──
	const cursorLineRef = useRef(0);
	const lineCountRef = useRef(1);

	// ── textarea 实例 ──
  const textareaRef = useRef<TextareaRenderable>(null);

  // ── 失焦自动抢回：除弹窗激活外，始终聚焦 textarea ──
  const popupActiveRef = useRef(popupActive);
  popupActiveRef.current = popupActive;

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handler = () => {
      if (!popupActiveRef.current) ta.focus();
    };
    ta.on("blurred", handler);
    return () => {
      ta.off("blurred", handler);
    };
  }, []);

	// ── slash 命令补全：输入 / 开头时过滤已注册指令 ──
	const slashSuggestions = (() => {
		if (!inputText.startsWith("/") || popupActive) return [];
		const query = inputText.slice(1).toLowerCase();
		// 输入恰好等于完整指令时不显示提示，让 Enter 走提交
		if (registry.get(query)) return [];
		return registry.list().filter((cmd) => cmd.name.startsWith(query));
	})();

	// 输入变化时重置选中项
	useEffect(() => {
		setSelectedSuggestionIdx(0);
	}, [inputText]);

	// ── 内容变化：实时同步草稿 + 更新行数 ──
	const handleContentChange = useCallback((_event: ContentChangeEvent) => {
		const ta = textareaRef.current;
		if (!ta) return;
		const lines = ta.lineCount;
		lineCountRef.current = lines;
		setContentLines(Math.min(lines, MAX_LINES));
		setInputText(ta.plainText);

		// 草稿模式下实时同步（包括空状态）
		if (historyIdxRef.current === -1) {
			draftRef.current = ta.plainText;
		}
	}, []);

	// ── 光标变化：记录当前行号 ──
	const handleCursorChange = useCallback((event: CursorChangeEvent) => {
		cursorLineRef.current = event.line;
	}, []);

	// ── 历史消息切换 ──
	const switchHistory = useCallback((direction: "up" | "down") => {
		const ta = textareaRef.current;
		if (!ta) return;
		const history = historyRef.current;

		if (direction === "up") {
			// 已在最旧的历史，不处理
			if (historyIdxRef.current >= history.length - 1) return;

			// 从草稿切到历史前，草稿已经由 handleContentChange 实时同步过了
			historyIdxRef.current += 1;
			ta.setText(history[historyIdxRef.current]!);
			lineCountRef.current = ta.lineCount;
			ta.setCursor(0, 0);
		} else {
			// 已在草稿，不处理
			if (historyIdxRef.current === -1) return;

			historyIdxRef.current -= 1;
			if (historyIdxRef.current === -1) {
				ta.setText(draftRef.current);
			} else {
				ta.setText(history[historyIdxRef.current]!);
			}
			lineCountRef.current = ta.lineCount;
			const lastLine = lineCountRef.current - 1;
			ta.setCursor(lastLine, 0);
			ta.gotoLineTextEnd();
		}
	}, []);

	// ── Enter 补全：用选中项填入 textarea ──
	const enterComplete = useCallback(() => {
		if (slashSuggestions.length === 0) return;
		const ta = textareaRef.current;
		if (!ta) return;
		const cmd = slashSuggestions[selectedSuggestionIdx] ?? slashSuggestions[0]!;
		const completed = `/${cmd.name}`;
		ta.setText(completed);
		lineCountRef.current = 1;
		ta.setCursor(0, completed.length);
		ta.gotoLineTextEnd();
		setInputText(completed);
		draftRef.current = completed;
	}, [slashSuggestions, selectedSuggestionIdx]);

	// ── 全局键盘：截获 textarea 冒泡出来的按键 ──
	useKeyboard((key) => {
		// 快捷键始终生效，不受 popupActive 影响
		if (matchesKeybind(key, KEYBINDS.openModels)) {
			onOpenModels();
			return;
		}
		if (matchesKeybind(key, KEYBINDS.openProviders)) {
			onOpenProviders();
			return;
		}
		if (matchesKeybind(key, KEYBINDS.openHelp)) {
			onShowHelp();
			return;
		}

		// 弹窗激活时，跳过后续按键，让弹窗组件接管
		if (popupActive) return;

		// 补全提示可见时，拦截 Up/Down/Enter，preventDefault 防止 textarea 吞键
		if (slashSuggestions.length > 0) {
			if (key.name === "up") {
				key.preventDefault();
				setSelectedSuggestionIdx((i) => Math.max(0, i - 1));
				return;
			}
			if (key.name === "down") {
				key.preventDefault();
				setSelectedSuggestionIdx((i) =>
					Math.min(slashSuggestions.length - 1, i + 1),
				);
				return;
			}
			if (key.name === "return") {
				key.preventDefault();
				enterComplete();
				return;
			}
		}

		if (key.name === "up") {
			if (cursorLineRef.current === 0) {
				switchHistory("up");
			}
		} else if (key.name === "down") {
			if (cursorLineRef.current === lineCountRef.current - 1) {
				switchHistory("down");
			}
		} else if (key.ctrl && key.name === "c" && onEsc) {
			onEsc();
		}
	});

	// ── 提交 ──
	const handleSubmit = useCallback(() => {
		const ta = textareaRef.current;
		if (!ta) return;
		const text = ta.plainText.trim();
		if (!text) return;

		// 存入历史（新的在前，去重，限制 6 条）
		const history = historyRef.current;
		if (history[0] !== text) {
			history.unshift(text);
			if (history.length > MAX_HISTORY) history.pop();
		}

		// 重置状态
		historyIdxRef.current = -1;
		draftRef.current = "";
		ta.clear();
		setContentLines(1);
		setInputText("");
		lineCountRef.current = 1;

		onSubmit(text);
	}, [onSubmit]);

	// ── 外层高度：内容行数 + 2 行边框，限制 3~6 ──
	const boxHeight = Math.min(contentLines + 2, MAX_LINES + 2);

	return (
		<>
			{/* slash 命令补全提示框 -- 无边框，像输入框向上延伸 */}
			{slashSuggestions.length > 0 && (
				<box
					position="absolute"
					bottom={boxHeight + 1}
					left={2}
					right={2}
					zIndex={50}
					backgroundColor={C.suggestionBg}
					paddingX={1}
					flexDirection="column"
				>
					{slashSuggestions.map((cmd, i) => (
						<box key={cmd.name} flexDirection="row">
							<box width={14}>
								<text fg={i === selectedSuggestionIdx ? C.border : C.text}>
									{` /${cmd.name}`}
								</text>
							</box>
							<text fg={i === selectedSuggestionIdx ? C.border : C.subtext}>
								{cmd.description}
							</text>
						</box>
					))}
				</box>
			)}
			<box
				height={boxHeight}
				width="100%"
				border={["top", "bottom", "left"]}
				customBorderChars={inputBorder}
				borderColor={C.border}
				flexDirection="row"
				paddingX={1}
			>
				<textarea
					ref={textareaRef}
					focused={!popupActive}
					flexGrow={1}
					placeholder="输入消息... (Ctrl+Enter 换行)"
					placeholderColor={C.subtext}
					textColor={C.text}
					wrapMode="none"
					keyBindings={[
						{ name: "return", ctrl: true, action: "newline" },
						{ name: "return", action: "submit" },
						{ name: "kpenter", ctrl: true, action: "newline" },
						{ name: "kpenter", action: "submit" },
					]}
					onContentChange={handleContentChange}
					onCursorChange={handleCursorChange}
					onSubmit={handleSubmit}
				/>
			</box>
		</>
	);
}
