/**
 * UserMessageCard - 用户消息卡片
 *
 * 外框仅负责左边框 + 标题，内框负责背景填充，
 * 通过 marginLeft 在左边框左边界与背景左边界之间制造间隙。
 */

const C = {
	border: "#cba6f7",
	bg: "#1e1e2e",
	text: "#cdd6f4",
};

export interface UserMessageCardProps {
	text: string;
}

export function UserMessageCard({ text }: UserMessageCardProps) {
	return (
		<box border={["left"]} borderStyle="heavy" borderColor={C.border}>
			<box backgroundColor={C.bg} marginLeft={0} paddingX={2} paddingY={1}>
				<text fg={C.text}>{text}</text>
			</box>
		</box>
	);
}
