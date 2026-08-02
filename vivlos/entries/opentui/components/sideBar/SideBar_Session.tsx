/**
 * SidebarSession - 当前 Session 标题与 ID。
 *
 * 标题生成状态由 useAgent 注入；组件只负责截断和本地呼吸动画。
 */

import { useEffect, useState } from "react";
import stringWidth from "string-width";

const C = {
	titleSoft: "#ee99a0", // Macchiato/Maroon
	title: "#f5bde6", // Macchiato/Pink
	muted: "#8087a2", // Macchiato/Overlay 1
} as const;
const CONTENT_WIDTH = 38;
const BREATH_INTERVAL = 160;
const GENERATING_TITLE = "标题生成中...";
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// #region Types

export interface SidebarSessionProps {
	readonly sessionName: string;
	readonly sessionId: string;
	readonly titleGenerating: boolean;
}

interface AnimatedCharacter {
	readonly character: string;
	readonly color: string;
}

// #endregion

// #region Session Header

export function SidebarSession({
	sessionName,
	sessionId,
	titleGenerating,
}: SidebarSessionProps) {
	const animatedTitle = useBreathingTitle(titleGenerating);

	return (
		<box paddingX={2} flexDirection="column">
			{titleGenerating ? (
				<box height={1} flexDirection="row">
					{animatedTitle.map((item, index) => (
						<text key={index} fg={item.color}>{item.character}</text>
					))}
				</box>
			) : (
				<text fg={C.title}>{trimName(sessionName)}</text>
			)}
			<text fg={C.muted}>session id: {sessionId}</text>
			<box height={1} />
		</box>
	);
}

// #endregion

// #region Breathing Animation

function useBreathingTitle(active: boolean): readonly AnimatedCharacter[] {
	const [tick, setTick] = useState(0);

	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => setTick((current) => current + 1), BREATH_INTERVAL);
		return () => clearInterval(timer);
	}, [active]);

	const characters = graphemes(GENERATING_TITLE);
	const brightIndex = tick % characters.length;
	return characters.map((character, index) => ({
		character,
		color: index === brightIndex ? C.title : C.titleSoft,
	}));
}

// #endregion

// #region Formatters

function trimName(value: string): string {
	if (stringWidth(value) <= CONTENT_WIDTH) return value;
	let result = "";
	for (const part of graphemes(value)) {
		if (stringWidth(`${result}${part}…`) > CONTENT_WIDTH) break;
		result += part;
	}
	return `${result.trimEnd()}…`;
}

function graphemes(value: string): string[] {
	return Array.from(segmenter.segment(value), (item) => item.segment);
}

// #endregion
