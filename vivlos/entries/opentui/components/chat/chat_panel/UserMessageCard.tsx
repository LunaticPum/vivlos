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
	image: "#f9e2af",
};

export interface UserMessageCardProps {
	text: string;
	/** 本轮附带的图片文件名 */
	attachedImages?: readonly string[];
}

export function UserMessageCard({ text, attachedImages }: UserMessageCardProps) {
	return (
		<box border={["left"]} borderStyle="heavy" borderColor={C.border}>
			<box backgroundColor={C.bg} marginLeft={0} paddingX={2} paddingY={1} flexDirection="column">
				{(attachedImages?.length ?? 0) > 0 &&
					attachedImages!.map((name, index) => (
						<text key={`${name}-${index}`} fg={C.image}>
							{`[图片: ${name}]`}
						</text>
					))}
				{text && <text fg={C.text}>{text}</text>}
			</box>
		</box>
	);
}
