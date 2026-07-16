/**
 * CustomProviderPopup - 自定义 Provider 配置弹窗
 *
 * 用户填写 API 标准(鼠标点击)、Base URL、Model ID、API Key、Context Window，
 * Enter 提交前校验必填字段非空（Ctx 可选）。
 * 提交后由 ChatPanel 走连接验证流程。
 */

import { useState, useRef } from "react";
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

/** 解析用户输入的 context window：支持 128k / 1M / 128000 */
function parseContextWindow(input: string): number | undefined {
	const m = input
		.trim()
		.toLowerCase()
		.match(/^(\d+(?:\.\d+)?)([km]?)$/);
	if (!m) return undefined;
	const n = parseFloat(m[1]);
	return m[2] === "k"
		? Math.round(n * 1000)
		: m[2] === "m"
			? Math.round(n * 1_000_000)
			: Math.round(n);
}

export interface CustomProviderPopupProps {
	onSubmit: (config: {
		baseUrl: string;
		apiStandard: "openai" | "anthropic";
		modelId: string;
		apiKey: string;
		contextWindow?: number;
	}) => void;
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
	const [ctxWindow, setCtxWindow] = useState("");
	const [focusIdx, setFocusIdx] = useState(0); // 0=URL, 1=Model, 2=Key, 3=Ctx
	const [showHint, setShowHint] = useState(false);

	const inputRefs = useRef<(InputRenderable | null)[]>([
		null,
		null,
		null,
		null,
	]);

	const resetViewport = (idx: number) => {
		const input = inputRefs.current[idx];
		if (!input) return;
		const vp = input.editorView.getViewport();
		input.editorView.setViewport(0, vp.offsetY, vp.width, vp.height);
	};

	useKeyboard((key) => {
		if (key.name === "escape") {
			onClose();
			return;
		}
		if (key.name === "up") {
			key.preventDefault();
			resetViewport(focusIdx);
			setFocusIdx((i) => (i + 3) % 4);
			return;
		}
		if (key.name === "down") {
			key.preventDefault();
			resetViewport(focusIdx);
			setFocusIdx((i) => (i + 1) % 4);
			return;
		}
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
				contextWindow: parseContextWindow(ctxWindow),
			});
			return;
		}
	});

	return (
		<box
			width="45%"
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
			<box flexDirection="column" flexGrow={1} width="90%">
				{/* API 标准 */}
				<box flexDirection="row">
					<text fg={C.label} width={7}>
						{"API:   "}
					</text>
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
				<box flexDirection="row" marginTop={1} overflow="hidden" width="100%">
					<text fg={C.label} width={7}>
						{"URL:   "}
					</text>
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
				<box flexDirection="row" marginTop={1} overflow="hidden" width="100%">
					<text fg={C.label} width={7}>
						{"Model: "}
					</text>
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
				<box flexDirection="row" marginTop={1} overflow="hidden" width="100%">
					<text fg={C.label} width={7}>
						{"Key:   "}
					</text>
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

				{/* Context Window（可选） */}
				<box flexDirection="row" marginTop={1} overflow="hidden" width="100%">
					<text fg={C.label} width={7}>
						{"Ctx:   "}
					</text>
					<input
						ref={(el) => {
							inputRefs.current[3] = el;
						}}
						focused={focusIdx === 3}
						flexGrow={1}
						selectable={false}
						wrapMode="none"
						placeholder="留空则自动检测，可填入如 128k / 1M / 128000"
						placeholderColor={C.hint}
						textColor={C.text}
						onInput={setCtxWindow}
					/>
				</box>

				{showHint && (
					<box marginTop={1}>
						<text fg={C.border}>{"请完成必填字段（URL / Model / Key）"}</text>
					</box>
				)}
			</box>

			<box flexDirection="row" justifyContent="center" width="100%">
				<text fg={C.hint}>{"Enter 确认  Esc 返回"}</text>
			</box>
		</box>
	);
}
