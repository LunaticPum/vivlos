/**
 * SidebarMemory - 只读 Memory 概览。
 *
 * 组件拥有 L1-L4 的局部导航状态和交互，不读取或修改 Memory 文件。
 */

import { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { MouseButton, type MouseEvent } from "@opentui/core";
import type { L2Overview } from "@vivlos/infra/storage/memory/index.ts";

const C = {
	text: "#cad3f5", // Macchiato/Text
	secondary: "#a5adcb", // Macchiato/Subtext 0
	muted: "#8087a2", // Macchiato/Overlay 1
	border: "#6e738d", // Macchiato/Overlay 0
	track: "#494d64", // Macchiato/Surface 1
	background: "#1e2030", // Macchiato/Mantle
	activeBackground: "#181926", // Macchiato/Crust
	accent: "#c6a0f6", // Macchiato/Mauve
	title: "#f5bde6", // Macchiato/Pink
	success: "#a6da95", // Macchiato/Green
	warning: "#eed49f", // Macchiato/Yellow
	error: "#ed8796", // Macchiato/Red
} as const;
const BAR_WIDTH = 12;
const CARD_HEIGHT = 10;
const layers = [1, 2, 3, 4] as const;

// #region Types

export interface FilePreview {
	readonly exists: boolean;
	readonly used: number;
	readonly cap: number;
	readonly entryCount: number;
	readonly updatedAt: number | null;
}

export interface SidebarMemoryPreview {
	readonly sessionId: string;
	readonly path: string | null;
	readonly memory: FilePreview | null;
	readonly user: FilePreview | null;
	/** L2 索引概览；null 表示 L2 未启用。 */
	readonly l2: L2Overview | null;
}

export interface SidebarMemoryProps {
	readonly preview: SidebarMemoryPreview;
	readonly active: boolean;
	readonly onActiveChange: (active: boolean) => void;
}

type Layer = (typeof layers)[number];

// #endregion

// #region Formatters

function formatChars(value: number): string {
	if (value < 1_000) return String(value);
	const unit = value < 1_000_000 ? "k" : "m";
	const divisor = unit === "k" ? 1_000 : 1_000_000;
	const amount = value / divisor;
	return `${amount >= 10 ? Math.round(amount) : amount.toFixed(1)}${unit}`;
}

function formatAge(updatedAt: number | null): string {
	if (updatedAt === null) return "never";
	const seconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1_000));
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

// #endregion

// #region Memory Overview

export function SidebarMemory({
	preview,
	active,
	onActiveChange,
}: SidebarMemoryProps) {
	const [layer, setLayer] = useState<Layer>(1);
	const [expanded, setExpanded] = useState(true);
	const activeLayers: readonly Layer[] = preview.l2 ? [1, 2] : [1];

	useEffect(() => {
		setLayer(1);
		setExpanded(true);
	}, [preview.sessionId]);

	useKeyboard((key) => {
		if (!active) return;
		if (key.name === "escape") {
			key.preventDefault();
			key.stopPropagation();
			onActiveChange(false);
			return;
		}
		if (!expanded || (key.name !== "left" && key.name !== "right")) return;
		key.preventDefault();
		key.stopPropagation();
		setLayer((current) => moveLayer(current, key.name === "left" ? -1 : 1));
	});

	const activate = (event: MouseEvent) => {
		if (event.button !== MouseButton.LEFT) return;
		event.stopPropagation();
		onActiveChange(true);
	};

	const toggle = (event: MouseEvent) => {
		if (event.button !== MouseButton.LEFT) return;
		setExpanded((current) => !current);
	};

	const selectLayer = (next: Layer, event: MouseEvent) => {
		if (event.button !== MouseButton.LEFT) return;
		event.stopPropagation();
		setLayer(next);
		onActiveChange(true);
	};

	return (
		<box
			width="100%"
			flexDirection="column"
			paddingY={1}
			backgroundColor={active ? C.activeBackground : C.background}
			onMouseDown={activate}
		>
			<box paddingX={2} flexDirection="column">
				<box
					width="100%"
					height={1}
					flexDirection="row"
					onMouseDown={toggle}
				>
					<text fg={C.title}>MEMORY</text>
					<box flexGrow={1} />
					<box flexDirection="row">
						<text fg={C.success}>active </text>
						{layers.map((item, index) => (
							<box key={item} flexDirection="row">
								{index > 0 && <text fg={C.muted}>/</text>}
								<text fg={activeLayers.includes(item) ? C.title : C.muted}>
									L{item}
								</text>
							</box>
						))}
						<text fg={C.muted}>{expanded ? " ▾" : " ▸"}</text>
					</box>
				</box>
				{expanded && (
					<>
						<box marginTop={1}>
							<MemoryCard layer={layer} preview={preview} active={active} />
						</box>
						<box height={1} flexDirection="row" justifyContent="center" gap={2}>
							{layers.map((item) => (
								<box key={item} onMouseDown={(event) => selectLayer(item, event)}>
									<text fg={item === layer ? C.title : C.muted}>{item}</text>
								</box>
							))}
						</box>
					</>
				)}
			</box>
		</box>
	);
}

function moveLayer(current: Layer, step: -1 | 1): Layer {
	const index = layers.indexOf(current);
	return layers[(index + step + layers.length) % layers.length]!;
}

// #endregion

// #region Memory Card

function MemoryCard({
	layer,
	preview,
	active,
}: {
	layer: Layer;
	preview: SidebarMemoryPreview;
	active: boolean;
}) {
	return (
		<box
			width="100%"
			height={CARD_HEIGHT}
			border={true}
			borderStyle="single"
			borderColor={active ? C.accent : C.border}
			title={`L${layer}-Memo`}
			titleColor={active ? C.title : C.secondary}
			paddingX={1}
			flexDirection="column"
		>
			{layer === 1 && (
				<>
					<box width="100%" flexDirection="row">
						<text fg={C.muted}>Storage</text>
						<box flexGrow={1} />
						<text fg={C.secondary}>Session Markdown</text>
					</box>
					<box width="100%" flexDirection="row">
						<text fg={C.muted}>Location</text>
						<box flexGrow={1} />
						<text fg={C.secondary}>
							{preview.path ? ".vivlos/sessions" : "unavailable"}
						</text>
					</box>
					<box height={1} />
					<FileRow name="memory.md" file={preview.memory} />
					<FileRow name="user.md" file={preview.user} />
				</>
			)}
			{layer === 2 && (
				<>
					<box width="100%" flexDirection="row">
						<text fg={C.muted}>Storage</text>
						<box flexGrow={1} />
						<text fg={C.secondary}>SQLite FTS5</text>
					</box>
					<box width="100%" flexDirection="row">
						<text fg={C.muted}>Location</text>
						<box flexGrow={1} />
						<text fg={C.secondary}>.vivlos/memory.db</text>
					</box>
					<box height={1} />
					{preview.l2 ? (
						<>
							<StatRow
								name="Sessions"
								value={formatChars(preview.l2.sessionCount)}
							/>
							<StatRow
								name="Messages"
								value={formatChars(preview.l2.messageCount)}
							/>
							<StatRow
								name="Indexed"
								value={formatAge(preview.l2.lastIndexedAt)}
							/>
						</>
					) : (
						<box width="100%" flexDirection="row">
							<text fg={C.muted}>Status</text>
							<box flexGrow={1} />
							<text fg={C.muted}>disabled</text>
						</box>
					)}
				</>
			)}
		</box>
	);
}

// #endregion

// #region Stat Row

function StatRow({ name, value }: { name: string; value: string }) {
	return (
		<box width="100%" flexDirection="row">
			<text fg={C.text}>{name}</text>
			<box flexGrow={1} />
			<text fg={C.secondary}>{value}</text>
		</box>
	);
}

// #endregion

// #region File Usage

function FileRow({ name, file }: { name: string; file: FilePreview | null }) {
	if (file === null) {
		return (
			<box flexDirection="column">
				<box width="100%" flexDirection="row">
					<text fg={C.text}>{name}</text>
					<box flexGrow={1} />
					<text fg={C.muted}>--</text>
				</box>
				<box width="100%" flexDirection="row">
					<box width={BAR_WIDTH} flexDirection="row">
						<text fg={C.track}>{"░".repeat(BAR_WIDTH)}</text>
					</box>
					<text fg={C.muted}>{" --%"}</text>
					<box flexGrow={1} />
					<text fg={C.muted}>--/--</text>
				</box>
			</box>
		);
	}
	const percent = file.cap > 0
		? Math.min(100, Math.max(0, Math.round((file.used / file.cap) * 100)))
		: 0;
	const filled = Math.round((percent / 100) * BAR_WIDTH);
	const color = !file.exists
		? C.muted
		: percent >= 85
			? C.error
			: percent >= 70
				? C.warning
				: C.success;
	const usage = `${formatChars(file.used)}/${formatChars(file.cap)}`;
	const status = file.exists ? formatAge(file.updatedAt) : "not ready";

	return (
		<box flexDirection="column">
			<box width="100%" flexDirection="row">
				<text fg={C.text}>{name}</text>
				<box flexGrow={1} />
				<text fg={C.muted}>{status}</text>
			</box>
			<box width="100%" flexDirection="row">
				<box width={BAR_WIDTH} flexDirection="row">
					<text fg={color}>{"█".repeat(filled)}</text>
					<text fg={C.track}>{"░".repeat(BAR_WIDTH - filled)}</text>
				</box>
				<text fg={color}>{` ${percent}%`}</text>
				<box flexGrow={1} />
				<text fg={C.secondary}>{usage}</text>
			</box>
		</box>
	);
}

// #endregion
