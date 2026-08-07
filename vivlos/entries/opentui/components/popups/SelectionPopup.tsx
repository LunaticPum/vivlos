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
	error: "#f38ba8",
	tagText: "#94e2d5",
	tagVision: "#f9e2af",
	visionMark: "#f9e2af",
} as const;

export interface SelectionItem {
	id: string;
	label: string;
	suffix?: string;
	/** 能力标签，如 "[文本]" 或 "[文本,视觉]"；vision 标签用亮色渲染 */
	tag?: string;
	/** tag 是否包含视觉能力（决定亮色配色） */
	tagVision?: boolean;
}

export interface SelectionPopupProps {
	title: string;
	recentItems: SelectionItem[];
	allItems: SelectionItem[];
	currentItemId: string;
	onSelect: (id: string) => void;
	onClose: () => void;
	onSwitchToProviders?: () => void;
	/** 可选：删除当前选中项（仅 sessions 场景传入） */
	onDelete?: (id: string) => void;
	/** 可选：双击 g 指定/取消视觉模型（仅 models 场景传入） */
	onSetVision?: (id: string) => void;
	/** 支持视觉的模型 id 集合（配合 onSetVision 使用） */
	visionItemIds?: readonly string[];
	/** 当前已指定的视觉模型 id */
	visionItemId?: string;
	/** 可选：启用键入过滤（models 场景） */
	filterable?: boolean;
	/** 全部分组的标题（默认 "Current"） */
	allItemsHeader?: string;
}

type Entry =
	| { kind: "header"; label: string }
	| { kind: "spacer" }
	| { kind: "item"; item: SelectionItem };

export function SelectionPopup({
	title,
	recentItems,
	allItems,
	currentItemId,
	onSelect,
	onClose,
	onSwitchToProviders,
	onDelete,
	onSetVision,
	visionItemIds,
	visionItemId,
	filterable,
	allItemsHeader,
}: SelectionPopupProps) {
	// 键入过滤状态（filterable 时启用）
	const [filter, setFilter] = useState("");
	const matchesFilter = (item: SelectionItem): boolean => {
		if (!filter) return true;
		const query = filter.toLowerCase();
		return (
			item.label.toLowerCase().includes(query) ||
			item.id.toLowerCase().includes(query)
		);
	};
	const visibleRecent = recentItems.filter(matchesFilter);
	const visibleAll = allItems.filter(matchesFilter);

	const entries: Entry[] = [];
	if (visibleRecent.length > 0) {
		entries.push({ kind: "header", label: "  Recent" });
		for (const item of visibleRecent) entries.push({ kind: "item", item });
		entries.push({ kind: "spacer" });
	}
	if (visibleAll.length > 0) {
		entries.push({ kind: "header", label: `  ${allItemsHeader ?? "Current"}` });
		for (const item of visibleAll) entries.push({ kind: "item", item });
	}

	const [selectedIdx, setSelectedIdx] = useState(() => {
		const idx = entries.findIndex(
			(e) => e.kind === "item" && e.item.id === currentItemId,
		);
		return idx >= 0 ? idx : entries.findIndex((e) => e.kind === "item");
	});

	// 过滤变化后光标落到第一个匹配项
	useEffect(() => {
		if (!filter) return;
		setSelectedIdx(() => {
			const idx = entries.findIndex((e) => e.kind === "item");
			return idx >= 0 ? idx : 0;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filter]);
	// 删除待确认：按 d 进入，再按一次执行；移动光标/超时自动取消
	const [pendingDelete, setPendingDelete] = useState<string | null>(null);
	const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// 视觉模型待确认：按 g 进入，再按一次执行；逻辑同 pendingDelete
	const [pendingVision, setPendingVision] = useState<string | null>(null);
	const visionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// 短暂提示（如"该模型不支持视觉"）
	const [flashMsg, setFlashMsg] = useState<string | null>(null);
	const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const cancelDelete = () => {
		setPendingDelete(null);
		if (deleteTimerRef.current) {
			clearTimeout(deleteTimerRef.current);
			deleteTimerRef.current = null;
		}
	};

	const cancelVision = () => {
		setPendingVision(null);
		if (visionTimerRef.current) {
			clearTimeout(visionTimerRef.current);
			visionTimerRef.current = null;
		}
	};

	const flash = (message: string) => {
		setFlashMsg(message);
		if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
		flashTimerRef.current = setTimeout(() => setFlashMsg(null), 3000);
	};

	const scrollRef = useRef<ScrollBoxRenderable>(null);

	useEffect(() => {
		let target = selectedIdx;
		if (target > 0 && entries[target - 1]!.kind !== "item") {
			target = target - 1;
		}
		scrollRef.current?.scrollChildIntoView(`item-${target}`);
	}, [selectedIdx, entries]);

	useKeyboard((key) => {
		if (key.name === "up") {
			key.preventDefault();
			cancelDelete();
			cancelVision();
			setSelectedIdx((i) => {
				for (let j = i - 1; j >= 0; j--)
					if (entries[j]!.kind === "item") return j;
				return i;
			});
		} else if (key.name === "down") {
			key.preventDefault();
			cancelDelete();
			cancelVision();
			setSelectedIdx((i) => {
				for (let j = i + 1; j < entries.length; j++)
					if (entries[j]!.kind === "item") return j;
				return i;
			});
		} else if (key.name === "return") {
			key.preventDefault();
			cancelDelete();
			cancelVision();
			const e = entries[selectedIdx];
			if (e?.kind === "item") onSelect(e.item.id);
		} else if (key.name === "escape") {
			key.preventDefault();
			if (filterable && filter) {
				setFilter("");
				return;
			}
			onClose();
		} else if (key.ctrl && key.name === "p" && onSwitchToProviders) {
			key.preventDefault();
			cancelDelete();
			cancelVision();
			onSwitchToProviders();
		} else if (onDelete && filter === "" && (key.name === "d" || key.name === "delete")) {
			key.preventDefault();
			const e = entries[selectedIdx];
			if (e?.kind !== "item") return;
			// 不允许删除当前会话
			if (e.item.id === currentItemId) return;
			if (pendingDelete === e.item.id) {
				// 第二次按 = 确认删除
				cancelDelete();
				onDelete(e.item.id);
			} else {
				// 第一次按 = 进入待确认
				setPendingDelete(e.item.id);
				if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
				// ponytail: 3s 自动取消确认，避免误触残留
				deleteTimerRef.current = setTimeout(() => setPendingDelete(null), 3000);
			}
		} else if (onSetVision && filter === "" && key.name === "g") {
			key.preventDefault();
			const e = entries[selectedIdx];
			if (e?.kind !== "item") return;
			const id = e.item.id;
			const supportsVision = visionItemIds?.includes(id) ?? false;
			if (!supportsVision) {
				cancelVision();
				flash("该模型不支持视觉理解");
				return;
			}
			if (pendingVision === id) {
				// 第二次按 = 确认指定/取消
				cancelVision();
				onSetVision(id);
			} else {
				// 第一次按 = 进入待确认
				setPendingVision(id);
				if (visionTimerRef.current) clearTimeout(visionTimerRef.current);
				visionTimerRef.current = setTimeout(() => setPendingVision(null), 3000);
			}
		} else if (filterable && key.name === "backspace") {
			key.preventDefault();
			cancelDelete();
			cancelVision();
			setFilter((f) => f.slice(0, -1));
		} else if (
			filterable &&
			!key.ctrl &&
			!key.meta &&
			(key.name.length === 1 || key.name === "space")
		) {
			// 可打印字符追加到过滤串
			key.preventDefault();
			cancelDelete();
			cancelVision();
			const char = key.name === "space" ? " " : key.name;
			setFilter((f) => f + char);
		}
	});

	// 卸载时清理定时器
	useEffect(() => () => {
		cancelDelete();
		cancelVision();
		if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
	}, []);

	return (
		<box
			width="45%"
			height="45%"
			overflow="hidden"
			border={true}
			borderStyle="rounded"
			borderColor={C.border}
			title={` ${title} `}
			titleAlignment="left"
			paddingX={3}
			backgroundColor={C.bg}
			flexDirection="column"
			alignItems="center"
			paddingTop={1}
			paddingBottom={0}
		>
			<box height="80%" overflow="hidden" width="100%">
				{entries.length === 0 ? (
					<box width="100%" paddingTop={1}>
						<text fg={C.hint}>{`  无匹配项${filter ? `: ${filter}` : ""}`}</text>
					</box>
				) : (
				<scrollbox
					ref={scrollRef}
					height="100%"
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
					const isSel = i === selectedIdx;
					const isCur = e.item.id === currentItemId;
					const isDelPending = pendingDelete === e.item.id;
					const isVisionPending = pendingVision === e.item.id;
					const isVision = e.item.id === visionItemId;
					return (
						<box
							key={e.item.id}
							id={`item-${i}`}
							flexDirection="row"
							width="100%"
						>
							<text fg={isDelPending ? C.error : isSel ? C.selected : C.normal}>
								{isDelPending ? "✕ " : isSel ? "▶ " : "  "}
								{e.item.label}
							</text>
							{isCur && <text fg={C.current}> ✓</text>}
							{isVision && <text fg={C.visionMark}> ◉</text>}
							<box flexGrow={1} />
							{e.item.tag && (
								<text fg={isVisionPending ? C.selected : e.item.tagVision ? C.tagVision : C.tagText}>
									{e.item.tag}{" "}
								</text>
							)}
							{e.item.suffix && <text fg={C.hint}>{e.item.suffix}</text>}
						</box>
					);
					})}
				</scrollbox>
				)}
			</box>

			{/* 弹性间隔：把提示行压到底部，且与列表内容至少隔开一行 */}
			<box flexGrow={1} minHeight={1} width="100%" />

			<box
				height={1}
				flexDirection="row"
				justifyContent="center"
				width="100%"
			>
				{pendingDelete ? (
					<text fg={C.error}>
						{"再按 d 确认删除  Esc/↑↓ 取消"}
					</text>
				) : pendingVision ? (
					<text fg={C.tagVision}>
						{visionItemId === pendingVision
							? "再按 g 取消视觉模型指定  Esc/↑↓ 取消"
							: "再按 g 确认为视觉模型  Esc/↑↓ 取消"}
					</text>
				) : flashMsg ? (
					<text fg={C.error}>{flashMsg}</text>
				) : filterable && filter ? (
					<text fg={C.selected}>{`筛选: ${filter}  (Backspace 删除, Esc 清空)`}</text>
				) : onDelete ? (
					<text fg={C.hint}>
						{"↑↓ 选择  Enter 切换  d 删除  Esc 退出"}
					</text>
				) : onSetVision ? (
					<text fg={C.hint}>
						{"↑↓ 选择  Enter 确认  键入筛选  g 视觉模型  Esc 退出"}
					</text>
				) : filterable ? (
					<text fg={C.hint}>{"↑↓ 选择  Enter 确认  键入筛选  Esc 退出"}</text>
				) : (
					<text fg={C.hint}>{"↑↓ 选择  Enter 确认  Esc 退出"}</text>
				)}
			</box>
		</box>
	);
}
