/**
 * ApiKeyPopup - API Key 输入弹窗
 *
 * 当用户切换到未配置 API Key 的 provider 时弹出。
 * 使用 <input> 组件接收输入，Enter 确认，Esc 返回 providers 弹窗。
 */

import { useState } from "react";
import { useKeyboard } from "@opentui/react";

const C = {
	border: "#f38ba8",
	bg: "#1e1e2e",
	text: "#cdd6f4",
	hint: "#6c7086",
} as const;

export interface ApiKeyPopupProps {
	/** 需要配置 key 的 provider id */
	provider: string;
	/** 提交 API Key */
	onSubmit: (key: string) => void;
	/** 取消，返回 providers 弹窗 */
	onClose: () => void;
}

export function ApiKeyPopup({ provider, onSubmit, onClose }: ApiKeyPopupProps) {
	const [key, setKey] = useState("");

	useKeyboard((key) => {
		if (key.name === "escape") onClose();
	});

	return (
		<box
			width="35%"
			height="25%"
			border={true}
			borderStyle="rounded"
			borderColor={C.border}
			title=" API Key Required "
			titleAlignment="center"
			paddingX={1}
			backgroundColor={C.bg}
			flexDirection="column"
			alignItems="center"
			paddingTop={1}
			paddingBottom={0}
			gap={1}
		>
			{/* 内容区 -- flexGrow 撑满，把提示顶到底部 */}
			<box flexDirection="column" flexGrow={1} width="100%">
				<text fg={C.text}>{`Provider "${provider}" 需要配置 API Key`}</text>
				<box marginTop={1}>
					<input
						focused={true}
						placeholder="输入 API Key..."
						placeholderColor={C.hint}
						textColor={C.text}
						onInput={setKey}
						onSubmit={() => {
							if (key.trim()) onSubmit(key.trim());
						}}
					/>
				</box>
			</box>
			{/* 底部提示 -- 贴着边框 */}
			<box flexDirection="row" justifyContent="center" width="100%" height={1}>
				<text fg={C.hint}>{"Enter 确认  Esc 返回"}</text>
			</box>
		</box>
	);
}
