/**
 * UserMessageCard - 用户消息卡片
 *
 * 样式：╭── You ──╮ 圆角边框 + 文本内容
 */

import { BorderCharacters } from "@opentui/core";

const C = {
	border: "#cba6f7",
	bg: "#313244",
};

// const cardBorder: BorderCharacters = {
// 	topLeft: "─",
// 	topRight: "─",
// 	bottomLeft: "─",
// 	bottomRight: "─",
// 	horizontal: "─",
// 	vertical: " ",
// 	topT: "",
// 	bottomT: "",
// 	leftT: "─",
// 	rightT: "─",
// 	cross: "─",
// };

export interface UserMessageCardProps {
	text: string;
}

export function UserMessageCard({ text }: UserMessageCardProps) {
	return (
		<box
			borderStyle="heavy"
			// customBorderChars={cardBorder}
			border={["left"]}
			borderColor={C.border}
			title=" You "
			titleAlignment="left"
			paddingX={1}
			paddingY={1}
			paddingLeft={0}
			marginBottom={1}
			backgroundColor={C.bg}
			shouldFill={true}
		>
			<text fg={"#cdd6f4"}>{" " + text}</text>
		</box>
	);
}
