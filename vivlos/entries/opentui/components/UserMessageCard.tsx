/**
 * UserMessageCard - 用户消息卡片
 *
 * 样式：╭── You ──╮ 圆角边框 + 文本内容
 */

import { BorderCharacters } from "@opentui/core";
import { getColors } from "../designs/colors";

const colors = getColors();

// const cardBorder: BorderCharacters = {
// 	topLeft: "┌",
// 	topRight: "",
// 	bottomLeft: "",
// 	bottomRight: "┘",
// 	horizontal: " ",
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
			borderStyle="rounded"
			borderColor={"#a6e3a1"}
			title=" You "
			titleAlignment="left"
			paddingX={1}
			paddingY={0}
			marginBottom={1}
		>
			<text fg={"#cdd6f4"}>{text}</text>
		</box>
	);
}
