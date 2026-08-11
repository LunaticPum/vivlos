/**
 * UserMessageCard - 用户消息卡片
 *
 * 外框仅负责左边框 + 标题，内框负责背景填充，
 * 通过 marginLeft 在左边框左边界与背景左边界之间制造间隙。
 *
 * variant（运行中插话 steering 的瞬态状态）：
 *   - "queued"  待处理：左上角 QUEUED + 橙色左边框
 *   - "unsent"  未发送：左上角 未发送 + 黄色左边框
 *   - 缺省       正常态：紫色左边框
 */

const C = {
	border: "#cba6f7",
	bg: "#1e1e2e",
	text: "#cdd6f4",
	image: "#f9e2af",
	queued: "#fab387",
	unsent: "#f9e2af",
};

export interface UserMessageCardProps {
	text: string;
	/** 本轮附带的图片文件名 */
	attachedImages?: readonly string[];
	/** 运行中插话的瞬态状态；缺省为正常态 */
	variant?: "queued" | "unsent";
}

export function UserMessageCard({
	text,
	attachedImages,
	variant,
}: UserMessageCardProps) {
	const borderColor = variant === "queued"
		? C.queued
		: variant === "unsent"
			? C.unsent
			: C.border;
	return (
		<box border={["left"]} borderStyle="heavy" borderColor={borderColor}>
			<box backgroundColor={C.bg} marginLeft={0} paddingX={2} paddingY={1} flexDirection="column">
				{variant === "queued" && <text fg={C.queued}>QUEUED</text>}
				{variant === "unsent" && <text fg={C.unsent}>未发送</text>}
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
