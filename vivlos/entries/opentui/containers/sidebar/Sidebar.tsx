/**
 * Sidebar - 当前 Session 信息与只读 Memory 概览。
 *
 * 当前只展示 L1 视觉原型。数据由 Workspace 注入，不读取或修改 Memory 文件。
 */

import { useEffect, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { MouseButton, type MouseEvent } from "@opentui/core";
import stringWidth from "string-width";
import { getColors } from "../../designs/colors";

const colors = getColors("macchiato");
const SIDEBAR_WIDTH = 42;
const CONTENT_WIDTH = 38;
const BAR_WIDTH = 12;
const CARD_HEIGHT = 10;
const layers = [1, 2, 3, 4] as const;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// #region Types

export interface FilePreview {
	readonly used: number;
	readonly cap: number;
	readonly updatedAt: number | null;
}

export interface SidebarPreview {
	readonly sessionName: string;
	readonly sessionId: string;
	readonly path: string;
	readonly cwd: string;
	readonly memory: FilePreview;
	readonly user: FilePreview;
}

export interface SidebarProps {
	readonly preview: SidebarPreview;
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

function trimPath(value: string, width: number): string {
	if (stringWidth(value) <= width) return value;
	const parts = Array.from(segmenter.segment(value), (item) => item.segment);
	let result = "";
	for (let index = parts.length - 1; index >= 0; index--) {
		const next = parts[index] + result;
		if (stringWidth(`...${next}`) > width) break;
		result = next;
	}
	return `...${result}`;
}

function trimName(value: string): string {
	if (stringWidth(value) <= CONTENT_WIDTH) return value;
	let result = "";
	for (const part of Array.from(segmenter.segment(value), (item) => item.segment)) {
		if (stringWidth(`${result}${part}…`) > CONTENT_WIDTH) break;
		result += part;
	}
	return `${result.trimEnd()}…`;
}

// #endregion

// #region Sidebar

export function Sidebar({ preview, active, onActiveChange }: SidebarProps) {
	const [layer, setLayer] = useState<Layer>(1);

	useEffect(() => {
		setLayer(1);
	}, [preview.sessionId]);

	useKeyboard((key) => {
		if (!active) return;
		if (key.name === "escape") {
			key.preventDefault();
			key.stopPropagation();
			onActiveChange(false);
			return;
		}
		if (key.name !== "left" && key.name !== "right") return;
		key.preventDefault();
		key.stopPropagation();
		setLayer((current) => moveLayer(current, key.name === "left" ? -1 : 1));
	});

	const activate = (event: MouseEvent) => {
		if (event.button !== MouseButton.LEFT) return;
		event.stopPropagation();
		onActiveChange(true);
	};

	const selectLayer = (next: Layer, event: MouseEvent) => {
		if (event.button !== MouseButton.LEFT) return;
		event.stopPropagation();
		setLayer(next);
		onActiveChange(true);
	};

	return (
		<box
			width={SIDEBAR_WIDTH}
			height="100%"
			flexShrink={0}
			flexDirection="column"
			backgroundColor={colors.bg.mantle}
			paddingY={1}
		>
			{/* #region Session */}
			<box paddingX={2} flexDirection="column">
				<text fg={colors.text.primary}>{trimName(preview.sessionName)}</text>
				<text fg={colors.text.muted}>session id: {preview.sessionId}</text>
				<box height={1} />
			</box>
			{/* #endregion */}

			{/* #region Memory Cards */}
			<box
				width="100%"
				flexDirection="column"
				paddingY={1}
				backgroundColor={active ? colors.bg.crust : colors.bg.mantle}
				onMouseDown={activate}
			>
				<box paddingX={2} flexDirection="column">
					<text fg={colors.accent.bright}>MEMORY</text>
					<box marginTop={1}>
						<MemoryCard layer={layer} preview={preview} active={active} />
					</box>
					<box
						height={1}
						flexDirection="row"
						justifyContent="center"
						gap={2}
					>
						{layers.map((item) => (
							<box key={item} onMouseDown={(event) => selectLayer(item, event)}>
								<text fg={item === layer ? colors.accent.bright : colors.text.muted}>
									{item}
								</text>
							</box>
						))}
					</box>
				</box>
			</box>
			{/* #endregion */}

			<box flexGrow={1} />

			{/* #region Working Directory */}
			<box paddingX={2} flexDirection="column">
				<text fg={colors.text.muted}>CWD</text>
				<text fg={colors.text.secondary}>
					{trimPath(preview.cwd, CONTENT_WIDTH)}
				</text>
			</box>
			{/* #endregion */}
		</box>
	);
}

// #endregion

// #region Memory Card

function MemoryCard({
	layer,
	preview,
	active,
}: {
	layer: Layer;
	preview: SidebarPreview;
	active: boolean;
}) {
	return (
		<box
			width="100%"
			height={CARD_HEIGHT}
			border={true}
			borderStyle="single"
			borderColor={active ? colors.accent.primary : colors.border.primary}
			title={`L${layer}-Memo`}
			titleColor={active ? colors.accent.bright : colors.text.secondary}
			paddingX={1}
			flexDirection="column"
		>
			{layer === 1 && (
				<>
					<box width="100%" flexDirection="row">
						<text fg={colors.text.muted}>Storage </text>
						<text fg={colors.text.secondary}>Session Markdown</text>
					</box>
					<box width="100%" flexDirection="row">
						<text fg={colors.text.muted}>Location </text>
						<text fg={colors.text.secondary}>
							{trimPath(preview.path, CONTENT_WIDTH - 13)}
						</text>
					</box>
					<box height={1} />
					<FileRow name="memory.md" file={preview.memory} />
					<FileRow name="user.md" file={preview.user} />
				</>
			)}
		</box>
	);
}

function moveLayer(current: Layer, step: -1 | 1): Layer {
	const index = layers.indexOf(current);
	return layers[(index + step + layers.length) % layers.length]!;
}

// #endregion

// #region File Usage

function FileRow({ name, file }: { name: string; file: FilePreview }) {
	const percent = file.cap > 0
		? Math.min(100, Math.max(0, Math.round((file.used / file.cap) * 100)))
		: 0;
	const filled = Math.round((percent / 100) * BAR_WIDTH);
	const color = percent >= 85
		? colors.semantic.error
		: percent >= 70
			? colors.semantic.warning
			: colors.semantic.success;
	const usage = `${formatChars(file.used)}/${formatChars(file.cap)}`;

	return (
		<box flexDirection="column">
			<box width="100%" flexDirection="row">
				<text fg={colors.text.primary}>{name}</text>
				<box flexGrow={1} />
				<text fg={colors.text.muted}>{formatAge(file.updatedAt)}</text>
			</box>
			<box width="100%" flexDirection="row">
				<text fg={color}>{"█".repeat(filled)}</text>
				<text fg={colors.bg.surface1}>{"░".repeat(BAR_WIDTH - filled)}</text>
				<text fg={color}>{` ${String(percent).padStart(3)}%`}</text>
				<box flexGrow={1} />
				<text fg={colors.text.secondary}>{usage}</text>
			</box>
		</box>
	);
}

// #endregion
