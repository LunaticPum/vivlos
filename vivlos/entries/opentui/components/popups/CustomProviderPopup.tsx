/**
 * CustomProviderPopup - 自定义 Provider 配置弹窗
 *
 * 用户填写 API 标准(鼠标点击)、Base URL、Model ID、API Key，
 * Enter 提交前校验所有字段非空。
 * 提交后由 ChatPanel 走连接验证流程。
 */

import { useState, useRef, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import type { InputRenderable } from "@opentui/core";

const C = {
	border: "#f9e2af",
	bg: "#1e1e2e",
	label: "#6c7086",
	text: "#cdd6f4",
	selected: "#cba6f7",
	selectedBg: "#313244",
	normalBg: "#181825",
	hint: "#6c7086",
} as const;

export interface CustomProviderPopupProps {
	/** 提交自定义 provider 配置 */
	onSubmit: (config: {
		baseUrl: string;
		apiStandard: "openai" | "anthropic";
		modelId: string;
		apiKey: string;
	}) => void;
	/** 返回 providers 弹窗 */
	onClose: () => void;
}

export function CustomProviderPopup({
	onSubmit,
	onClose,
}: CustomProviderPopupProps) {
	const [apiStandard, setApiStandard] = useState<"openai" | "anthropic">(
		"openai",
	);
	const [baseUrl, setBaseUrl] = useState("");
	const [modelId, setModelId] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [focusIdx, setFocusIdx] = useState(0); // 0=URL, 1=Model, 2=Key
	const [showHint, setShowHint] = useState(false);

	// 输入框 refs -- 焦点切换时重置 viewport 到起始位置（尾部截断）
	const inputRefs = useRef<(InputRenderable | null)[]>([null, null, null]);

	/** 重置指定输入框的 viewport 到起始位置（显示头部） */
	const resetViewport = (idx: number) => {
		const input = inputRefs.current[idx];
		if (!input) return;
		const vp = input.editorView.getViewport();
		input.editorView.setViewport(0, vp.offsetY, vp.width, vp.height);
	};

	useKeyboard((key) => {
		// Esc 始终可退出
		if (key.name === "escape") {
			onClose();
			return;
		}

		// ↑↓ 切换输入框焦点 -- 切换前重置当前输入框 viewport
		if (key.name === "up") {
			key.preventDefault();
			resetViewport(focusIdx);
			setFocusIdx((i) => (i + 2) % 3); // 0->2->1->0
			return;
		}
		if (key.name === "down") {
			key.preventDefault();
			resetViewport(focusIdx);
			setFocusIdx((i) => (i + 1) % 3); // 0->1->2->0
			return;
		}

		// Enter 校验 + 提交
		if (key.name === "return") {
			key.preventDefault();
			if (!baseUrl.trim() || !modelId.trim() || !apiKey.trim()) {
				setShowHint(true);
				return;
			}
			onSubmit({
				baseUrl: baseUrl.trim(),
				apiStandard,
				modelId: modelId.trim(),
				apiKey: apiKey.trim(),
			});
			return;
		}
	});

	return (
		<box
			width="35%"
			height="45%"
			border={true}
			borderStyle="rounded"
			borderColor={C.border}
			title=" Custom Provider "
			titleAlignment="center"
			paddingX={1}
			backgroundColor={C.bg}
			flexDirection="column"
			alignItems="center"
			paddingTop={1}
			paddingBottom={0}
			gap={1}
		>
			{/* 内容区 */}
			<box flexDirection="column" flexGrow={1} width="100%">
				{/* API 标准 -- 鼠标点击选择 */}
				<box flexDirection="row">
					<text fg={C.label}>{"API:   "}</text>
					<box
						onMouseDown={() => setApiStandard("openai")}
						backgroundColor={
							apiStandard === "openai" ? C.selectedBg : C.normalBg
						}
						paddingX={1}
					>
						<text fg={apiStandard === "openai" ? C.selected : C.text}>
							{"OpenAI"}
						</text>
					</box>
					<text fg={C.label}>{"  "}</text>
					<box
						onMouseDown={() => setApiStandard("anthropic")}
						backgroundColor={
							apiStandard === "anthropic" ? C.selectedBg : C.normalBg
						}
						paddingX={1}
					>
						<text fg={apiStandard === "anthropic" ? C.selected : C.text}>
							{"Anthropic"}
						</text>
					</box>
				</box>

				{/* Base URL */}
				<box flexDirection="row" marginTop={1}>
					<text fg={C.label}>{"URL:   "}</text>
					<input
						ref={(el) => {
							inputRefs.current[0] = el;
						}}
						focused={focusIdx === 0}
						flexGrow={1}
						selectable={false}
						wrapMode="none"
						placeholder="API 地址"
						placeholderColor={C.hint}
						textColor={C.text}
						onInput={setBaseUrl}
					/>
				</box>

				{/* Model ID */}
				<box flexDirection="row" marginTop={1}>
					<text fg={C.label}>{"Model: "}</text>
					<input
						ref={(el) => {
							inputRefs.current[1] = el;
						}}
						focused={focusIdx === 1}
						flexGrow={1}
						selectable={false}
						wrapMode="none"
						placeholder="gpt-4o"
						placeholderColor={C.hint}
						textColor={C.text}
						onInput={setModelId}
					/>
				</box>

				{/* API Key */}
				<box flexDirection="row" marginTop={1}>
					<text fg={C.label}>{"Key:   "}</text>
					<input
						ref={(el) => {
							inputRefs.current[2] = el;
						}}
						focused={focusIdx === 2}
						flexGrow={1}
						selectable={false}
						wrapMode="none"
						placeholder="sk-xxxxx"
						placeholderColor={C.hint}
						textColor={C.text}
						onInput={setApiKey}
					/>
				</box>

				{/* 校验提示 */}
				{showHint && (
					<box marginTop={1}>
						<text fg={C.border}>{"请完成所有字段"}</text>
					</box>
				)}
			</box>

			{/* 底部提示 -- 贴着边框 */}
			<box flexDirection="row" justifyContent="center" width="100%">
				<text fg={C.hint}>{"Enter 确认  Esc 返回"}</text>
			</box>
		</box>
	);
}
