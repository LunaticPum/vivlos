/**
 * WelcomeScreen - 欢迎界面
 *
 * conversationTurns 为空时显示，有对话后由 ChatArea 接管。
 * 居中显示 ASCII 艺术标题 + 环境信息 + 提示。
 */

import figlet from "figlet";

const C = {
	title: "#cba6f7",
	label: "#fab387",
	value: "#cdd6f4",
	tip: "#6c7086",
} as const;

const ASCII_ART = figlet.textSync("vivlos", { font: "ANSI Shadow" });

export interface WelcomeScreenProps {
	cwd: string;
	sessionId: string;
	modelLabel: string;
	version: string;
}

export function WelcomeScreen({
	cwd,
	sessionId,
	modelLabel,
	version,
}: WelcomeScreenProps) {
	const info: Array<[string, string]> = [
		["Directory", cwd],
		["Session", sessionId],
		["Model", modelLabel],
		["Version", version],
	];

	const maxLabelLen = Math.max(...info.map(([l]) => l.length));

	return (
		<box
			flexGrow={1}
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			width="100%"
		>
			{/* ASCII Art 标题 */}
			<box flexDirection="column" alignItems="center">
				{ASCII_ART.split("\n").map((line, i) => (
					<text key={i} fg={C.title}>
						{line}
					</text>
				))}
			</box>

			{/* 环境信息 */}
			<box flexDirection="column" marginTop={1}>
				{info.map(([label, value]) => (
					<box key={label} flexDirection="row">
						<text fg={C.label}>{`${label.padEnd(maxLabelLen)}  `}</text>
						<text fg={C.value}>{value}</text>
					</box>
				))}
			</box>

			{/* 提示 */}
			<box marginTop={2}>
				<text fg={C.tip}>
					{"Tip: 使用 /providers 配置 LLM 供应商，直接输入消息开始对话"}
				</text>
			</box>
		</box>
	);
}
