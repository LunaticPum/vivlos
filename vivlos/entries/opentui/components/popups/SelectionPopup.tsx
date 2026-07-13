/**
 * SelectionPopup - 列表选择弹窗
 *
 * models / providers 选择共用此组件。
 * position="absolute" + zIndex 覆盖在聊天区上方。
 * 键盘导航：↑↓ 移动、Enter 确认、Esc 关闭。
 * models 弹窗额外支持 Ctrl+P 跳转到 providers 弹窗。
 */

import { useState } from "react";
import { useKeyboard } from "@opentui/react";

const C = {
	border: "#cba6f7",
	bg: "#1e1e2e",
	selected: "#cba6f7",
	normal: "#cdd6f4",
	current: "#a6e3a1",
	hint: "#6c7086",
} as const;

export interface SelectionPopupProps {
	/** 弹窗标题 */
	title: string;
	/** 可选项列表 */
	items: string[];
	/** 当前已选中项的 id（显示 ✓ 标记） */
	currentItemId: string;
	/** 选中某项时触发 */
	onSelect: (id: string) => void;
	/** 关闭弹窗 */
	onClose: () => void;
	/** 跳转到 providers 弹窗（仅 models 弹窗传入） */
	onSwitchToProviders?: () => void;
}

export function SelectionPopup({
	title,
	items,
	currentItemId,
	onSelect,
	onClose,
	onSwitchToProviders,
}: SelectionPopupProps) {
	const [selectedIdx, setSelectedIdx] = useState(() =>
		Math.max(0, items.indexOf(currentItemId)),
	);

	useKeyboard((key) => {
		if (key.name === "up") {
			setSelectedIdx((i) => Math.max(0, i - 1));
		} else if (key.name === "down") {
			setSelectedIdx((i) => Math.min(items.length - 1, i + 1));
		} else if (key.name === "return") {
			onSelect(items[selectedIdx]!);
		} else if (key.name === "escape") {
			onClose();
		} else if (key.ctrl && key.name === "p" && onSwitchToProviders) {
			onSwitchToProviders();
		}
	});

	return (
		<box
			border={true}
			borderStyle="rounded"
			borderColor={C.border}
			title={` ${title} `}
			titleAlignment="left"
			paddingX={1}
			paddingY={1}
			backgroundColor={C.bg}
			flexDirection="column"
		>
			<box flexDirection="column">
				{items.map((item, i) => (
					<box key={item} flexDirection="row">
						<text fg={i === selectedIdx ? C.selected : C.normal}>
							{i === selectedIdx ? "▶ " : "  "}
							{item}
						</text>
						{item === currentItemId && <text fg={C.current}> ✓</text>}
					</box>
				))}
			</box>
			<box height={1} />
			<box flexDirection="row" justifyContent="center" width="100%">
				<text fg={C.hint}>{"↑↓ 选择  Enter 确认  Esc 退出"}</text>
			</box>
		</box>
	);
}
