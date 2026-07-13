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
 */

import { useState, useRef, useCallback } from "react";
import type {
	BorderCharacters,
	TextareaRenderable,
	CursorChangeEvent,
	ContentChangeEvent,
} from "@opentui/core";
import { useKeyboard } from "@opentui/react";

const C = {
	border: "#cba6f7",
	text: "#cdd6f4",
	subtext: "#a6adc8",
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
	onSubmit: (text: string) => void;
	onEsc?: () => void;
}

export function InputBar({ onSubmit, onEsc }: InputBarProps) {
	const [contentLines, setContentLines] = useState(1);

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

	// ── 内容变化：实时同步草稿 + 更新行数 ──
	const handleContentChange = useCallback((_event: ContentChangeEvent) => {
		const ta = textareaRef.current;
		if (!ta) return;
		const lines = ta.lineCount;
		lineCountRef.current = lines;
		setContentLines(Math.min(lines, MAX_LINES));

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

	// ── 全局键盘：截获 textarea 冒泡出来的 Up/Down/Esc ──
	useKeyboard((key) => {
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
		lineCountRef.current = 1;

		onSubmit(text);
	}, [onSubmit]);

	// ── 外层高度：内容行数 + 2 行边框，限制 3~6 ──
	const boxHeight = Math.min(contentLines + 2, MAX_LINES + 2);

	return (
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
				focused={true}
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
	);
}
