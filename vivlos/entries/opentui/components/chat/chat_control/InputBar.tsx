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
	ContentChangeEvent,
	ScrollBoxRenderable,
	PasteEvent,
} from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { TUICommandRegistry } from "../../../commands/registry";
import { KEYBINDS, matchesKeybind } from "../../../keybinds";
import {
	extractImagePaths,
	loadImageAttachment,
	type ImageAttachment,
} from "@vivlos/shared/utils/image.ts";
import { grabClipboardImage } from "@vivlos/infra/clipboard/image.ts";
import { getTempDir } from "@vivlos/infra/paths.ts";
import { log } from "@vivlos/infra/logger/index.ts";

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
const MAX_SUGGESTIONS = 5;

function visualLineCount(textarea: TextareaRenderable): number {
	return textarea.editorView.getTotalVirtualLineCount();
}

export interface InputBarProps {
	/** 提交文本与图片附件（非指令时触发） */
	onSubmit: (text: string, attachments: readonly ImageAttachment[]) => void;
	/** Ctrl+C 打断 / 退出 */
	onCtrlC?: () => void;
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
	onCtrlC,
	popupActive,
	onOpenModels,
	onOpenProviders,
	onShowHelp,
	registry,
}: InputBarProps) {
	const renderer = useRenderer();
	const [contentLines, setContentLines] = useState(1);
	const [inputText, setInputText] = useState("");
	const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
	const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
	// Ctrl+G 剪贴板读取进行中标记（防连按重复生成）
	const grabbingRef = useRef(false);

	// ── 历史消息状态 ──
	// history[0] = 最新，history[5] = 最旧；historyIdx = -1 表示草稿
	const historyRef = useRef<string[]>([]);
	const historyIdxRef = useRef(-1);
	const draftRef = useRef("");

	// ── textarea 实例 ──
	const textareaRef = useRef<TextareaRenderable>(null);
	// ── 补全框 scrollbox 实例 ──
	const suggestionScrollRef = useRef<ScrollBoxRenderable>(null);

	// ── 失焦自动抢回：除弹窗激活外，始终聚焦 textarea ──
	// 延迟一拍执行：点击其他区域时，点击目标的聚焦发生在 blur 事件之后，
	// 立即抢回会被点击流程覆盖。
	const popupActiveRef = useRef(popupActive);
	popupActiveRef.current = popupActive;

	useEffect(() => {
		const ta = textareaRef.current;
		if (!ta) return;
		const handler = () => {
			setTimeout(() => {
				if (!popupActiveRef.current) ta.focus();
			}, 0);
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

	// 选中项变化时滚动到可见位置（scrollbox 自带 scrollbar 自动显示/隐藏）
	useEffect(() => {
		if (slashSuggestions.length > 0) {
			suggestionScrollRef.current?.scrollChildIntoView(
				`sugg-${selectedSuggestionIdx}`,
			);
		}
	}, [selectedSuggestionIdx, slashSuggestions.length]);

	// 输入变化时重置选中项
	useEffect(() => {
		setSelectedSuggestionIdx(0);
	}, [inputText]);

	const syncContentLines = useCallback(() => {
		const ta = textareaRef.current;
		if (!ta) return;
		setContentLines(Math.min(Math.max(visualLineCount(ta), 1), MAX_LINES));
	}, []);

	// ── 内容变化：实时同步草稿 + 更新视觉行数 ──
	const handleContentChange = useCallback((_event: ContentChangeEvent) => {
		const ta = textareaRef.current;
		if (!ta) return;
		syncContentLines();
		setInputText(ta.plainText);

		// 草稿模式下实时同步（包括空状态）
		if (historyIdxRef.current === -1) {
			draftRef.current = ta.plainText;
		}
	}, [syncContentLines]);

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
			const lastLine = ta.lineCount - 1;
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

		// Ctrl+G：读取剪贴板位图（截图键截图）保存为临时 PNG 并挂为附件
		if (matchesKeybind(key, KEYBINDS.grabImage)) {
			key.preventDefault();
			// 读取较慢（PowerShell 冷启动），进行中忽略重复按键
			if (grabbingRef.current) return;
			grabbingRef.current = true;
			log("info", "正在读取剪贴板截图...", undefined, true);
			void (async () => {
				try {
					const grabbed = await grabClipboardImage(getTempDir());
					if (!grabbed.ok) {
						log("warn", grabbed.error.message, undefined, true);
						return;
					}
					const loaded = loadImageAttachment(grabbed.value);
					if (!loaded.ok) {
						log("warn", `截图附件失败: ${loaded.error.message}`, undefined, true);
						return;
					}
					setAttachments((prev) =>
						prev.some((a) => a.path === loaded.value.path)
							? prev
							: [...prev, loaded.value],
					);
				} finally {
					grabbingRef.current = false;
				}
			})();
			return;
		}

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
			const ta = textareaRef.current;
			if (ta && ta.scrollY + ta.visualCursor.visualRow === 0) {
				switchHistory("up");
			}
		} else if (key.name === "down") {
			const ta = textareaRef.current;
			if (
				ta &&
				ta.scrollY + ta.visualCursor.visualRow >= visualLineCount(ta) - 1
			) {
				switchHistory("down");
			}
		} else if (key.name === "backspace" && attachments.length > 0) {
			// 输入为空时 Backspace 移除最后一个附件
			const ta = textareaRef.current;
			if (ta && ta.plainText === "") {
				key.preventDefault();
				setAttachments((prev) => prev.slice(0, -1));
			}
		} else if (key.ctrl && key.name === "c") {
			if (renderer.hasSelection) {
				const text = renderer.getSelection()?.getSelectedText();
				if (text) {
					renderer.copyToClipboardOSC52(text);
					renderer.clearSelection();
				} else {
					// 残留零宽选区：清理后走 onCtrlC
					renderer.clearSelection();
					onCtrlC?.();
				}
			} else {
				onCtrlC?.();
			}
		}
	});

	// ── 提交 ──
	const handleSubmit = useCallback(() => {
		const ta = textareaRef.current;
		if (!ta) return;
		const text = ta.plainText.trim();
		if (!text && attachments.length === 0) return;

		// 存入历史（新的在前，去重，限制 6 条）
		if (text) {
			const history = historyRef.current;
			if (history[0] !== text) {
				history.unshift(text);
				if (history.length > MAX_HISTORY) history.pop();
			}
		}

		// 重置状态
		historyIdxRef.current = -1;
		draftRef.current = "";
		ta.clear();
		setContentLines(1);
		setInputText("");
		const pending = attachments;
		setAttachments([]);

		onSubmit(text, pending);
	}, [onSubmit, attachments]);

	// ── 粘贴拦截：终端拖入文件 = 粘贴路径，识别图片路径转为附件 ──
	const handlePaste = useCallback((event: PasteEvent) => {
		const text = new TextDecoder().decode(event.bytes);
		const paths = extractImagePaths(text);
		if (paths.length === 0) return;

		const loaded: ImageAttachment[] = [];
		for (const path of paths) {
			const result = loadImageAttachment(path);
			if (result.ok) {
				loaded.push(result.value);
			} else {
				log("warn", `图片附件失败: ${result.error.message}`, undefined, true);
			}
		}
		if (loaded.length === 0) return;
		event.preventDefault();
		setAttachments((prev) => [...prev, ...loaded]);
	}, []);

	// ── 外层高度：内容行数 + 2 行边框 + 附件行，限制 3~7 ──
	const attachmentRows = attachments.length > 0 ? 1 : 0;
	const boxHeight = Math.min(contentLines + 2 + attachmentRows, MAX_LINES + 3);

	return (
		<box width="100%" height={boxHeight} position="relative">
			{/* slash 命令补全提示框 -- 覆盖 StatusBar，不参与布局高度 */}
			{slashSuggestions.length > 0 && (
				<box
					position="absolute"
					bottom={boxHeight}
					left={0}
					right={0}
					zIndex={50}
					width="100%"
					backgroundColor={C.suggestionBg}
					flexDirection="column"
				>
					<scrollbox
						ref={suggestionScrollRef}
						height={Math.min(slashSuggestions.length, MAX_SUGGESTIONS)}
						backgroundColor={C.suggestionBg}
					>
						{slashSuggestions.map((cmd, i) => (
							<box
								key={cmd.name}
								id={`sugg-${i}`}
								width="100%"
								flexDirection="row"
								paddingX={1}
								backgroundColor={C.suggestionBg}
							>
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
					</scrollbox>
				</box>
			)}
			<box
				height={boxHeight}
				width="100%"
				border={["top", "bottom"]}
				customBorderChars={inputBorder}
				borderColor={C.border}
				flexDirection="column"
				paddingRight={1}
			>
				{attachments.length > 0 && (
					<box width="100%" flexDirection="row" paddingLeft={2}>
						<text fg={C.hint}>{"附件: "}</text>
						{attachments.map((attachment, index) => (
							<text key={`${attachment.path}-${index}`} fg={C.border}>
								{`[${attachment.name}] `}
							</text>
						))}
						<text fg={C.hint}>{"(空输入按 Backspace 移除)"}</text>
					</box>
				)}
				<box width="100%" flexGrow={1} flexDirection="row">
					<text width={1} height={1} fg={C.border}>❯</text>
					<box width={1} />
					<textarea
						ref={textareaRef}
						focused={!popupActive}
						showCursor={!popupActive}
						flexGrow={1}
						placeholder="输入消息... (Ctrl+Enter 换行，拖入图片 / Ctrl+G 粘贴截图)"
						placeholderColor={C.subtext}
						textColor={C.text}
						wrapMode="char"
						keyBindings={[
							{ name: "return", ctrl: true, action: "newline" },
							{ name: "return", action: "submit" },
							{ name: "kpenter", ctrl: true, action: "newline" },
							{ name: "kpenter", action: "submit" },
						]}
						onContentChange={handleContentChange}
						onSizeChange={syncContentLines}
						onSubmit={handleSubmit}
						onPaste={handlePaste}
					/>
				</box>
			</box>
		</box>
	);
}
