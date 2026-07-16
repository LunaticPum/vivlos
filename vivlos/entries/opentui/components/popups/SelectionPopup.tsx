/**
 * SelectionPopup - 列表选择弹窗
 *
 * models / providers 选择共用此组件。
 * 标题行（Recent/All）和空行间隔作为不可选项嵌入列表，
 * 全部在一个 scrollbox 内，简洁可靠。
 * 键盘导航：↑↓ 仅在有选项之间移动，跳过标题/空行。
 */

import { useState, useRef, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";

const C = {
	border: "#cba6f7",
	bg: "#1e1e2e",
	selected: "#cba6f7",
	normal: "#cdd6f4",
	current: "#a6e3a1",
	header: "#cba6f7",
	hint: "#6c7086",
} as const;

export interface SelectionPopupProps {
	title: string;
	recentItems: string[];
	allItems: string[];
	currentItemId: string;
	onSelect: (id: string) => void;
	onClose: () => void;
	onSwitchToProviders?: () => void;
}

type Entry =
	| { kind: "header"; label: string }
	| { kind: "spacer" }
	| { kind: "item"; id: string };

export function SelectionPopup({
	title,
	recentItems,
	allItems,
	currentItemId,
	onSelect,
	onClose,
	onSwitchToProviders,
}: SelectionPopupProps) {
	// 全部放入一个数组，渲染为一个滚动列表
	const entries: Entry[] = [];
	if (recentItems.length > 0) {
		entries.push({ kind: "header", label: "  Recent" });
		for (const id of recentItems) entries.push({ kind: "item", id });
		entries.push({ kind: "spacer" });
	}
	entries.push({ kind: "header", label: "  All" });
	for (const id of allItems) entries.push({ kind: "item", id });

	const [selectedIdx, setSelectedIdx] = useState(() => {
		const idx = entries.findIndex(
			(e) => e.kind === "item" && e.id === currentItemId,
		);
		return idx >= 0 ? idx : entries.findIndex((e) => e.kind === "item");
	});

	const scrollRef = useRef<ScrollBoxRenderable>(null);

	useEffect(() => {
		// 滚到选中项的上一个非选项条目（header/空行），确保标题可见
		let target = selectedIdx;
		if (target > 0 && entries[target - 1]!.kind !== "item") {
			target = target - 1;
		}
		scrollRef.current?.scrollChildIntoView(`item-${target}`);
	}, [selectedIdx, entries]);

	useKeyboard((key) => {
		if (key.name === "up") {
			setSelectedIdx((i) => {
				for (let j = i - 1; j >= 0; j--)
					if (entries[j]!.kind === "item") return j;
				return i;
			});
		} else if (key.name === "down") {
			setSelectedIdx((i) => {
				for (let j = i + 1; j < entries.length; j++)
					if (entries[j]!.kind === "item") return j;
				return i;
			});
		} else if (key.name === "return") {
			const e = entries[selectedIdx];
			if (e?.kind === "item") onSelect(e.id);
		} else if (key.name === "escape") {
			onClose();
		} else if (key.ctrl && key.name === "p" && onSwitchToProviders) {
			onSwitchToProviders();
		}
	});

	return (
		<box
			width="35%"
			height="45%"
			overflow="hidden"
			border={true}
			borderStyle="rounded"
			borderColor={C.border}
			title={` ${title} `}
			titleAlignment="left"
			paddingX={1}
			backgroundColor={C.bg}
			flexDirection="column"
			alignItems="center"
			paddingTop={1}
			paddingBottom={0}
		>
			<box flexGrow={1} overflow="hidden">
				<scrollbox
					ref={scrollRef}
					height="90%"
					verticalScrollbarOptions={{ visible: false }}
				>
					{entries.map((e, i) => {
						if (e.kind === "header") {
							return (
								<text key={`h-${i}`} id={`item-${i}`} fg={C.header}>
									{e.label}
								</text>
							);
						}
						if (e.kind === "spacer") {
							return <box key={`s-${i}`} id={`item-${i}`} height={1} />;
						}
						return (
							<box key={e.id} id={`item-${i}`} flexDirection="row">
								<text fg={i === selectedIdx ? C.selected : C.normal}>
									{i === selectedIdx ? "▶ " : "  "}
									{e.id}
								</text>
								{e.id === currentItemId && <text fg={C.current}> ✓</text>}
							</box>
						);
					})}
				</scrollbox>
			</box>

			<box flexDirection="row" justifyContent="center" width="100%">
				<text fg={C.hint}>{"↑↓ 选择  Enter 确认  Esc 退出"}</text>
			</box>
		</box>
	);
}
