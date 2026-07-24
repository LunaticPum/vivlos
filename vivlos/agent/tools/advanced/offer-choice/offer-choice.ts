/**
 * offer_choice tool -- TUI 交互选择
 *
 * Agent 输出选择项，TUI 渲染弹窗供用户选择，结果回灌给 agent。
 *
 * 异步机制：
 * 1. 生成唯一 resolveId
 * 2. emit offer_choice:pending 事件（TUI 监听后弹出 SelectionPopup）
 * 3. 订阅 offer_choice:resolved 事件，等待匹配 resolveId 的用户选择
 * 4. 收到选择后 resolve Promise，返回 tool result
 *
 * 支持 AbortSignal：用户 Ctrl+C 打断时取消等待。
 */

import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { shortId } from "@vivlos/shared/utils/id.ts";
import type { AdvancedToolDeps } from "../index.ts";
import { description } from "./description.ts";

const Params = Type.Object({
	prompt: Type.String({ description: "问题描述/上下文" }),
	choices: Type.Array(Type.String(), { description: "选项列表（2-10 个）" }),
	multiple: Type.Optional(Type.Boolean({ description: "是否允许多选（默认 false）" })),
});

type Params = Static<typeof Params>;

export function createOfferChoiceTool(deps: AdvancedToolDeps): AgentTool<typeof Params, { message: string }> {
	return {
		name: "offer_choice",
		description,
		label: "用户选择",
		parameters: Params,
		async execute(
			_toolCallId: string,
			params: Params,
			signal?: AbortSignal,
		): Promise<AgentToolResult<{ message: string }>> {
			const resolveId = shortId();

			return new Promise((resolve, reject) => {
				// 订阅用户选择结果，匹配 resolveId 后 resolve
				const unsub = deps.eventBus.on("offer_choice:resolved", (e) => {
					if (e.resolveId !== resolveId) return;
					unsub();
					const sel = e.selection;
					const text = Array.isArray(sel) ? sel.join(", ") : sel;
					resolve({
						content: [{ type: "text", text: `用户选择: ${text}` }],
						details: { message: `已选择：${text}` },
					});
				});

				// 用户打断时取消等待
				if (signal) {
					signal.addEventListener("abort", () => {
						unsub();
						reject(new Error("aborted"));
					}, { once: true });
				}

				// 通知 TUI 层弹出选择弹窗
				deps.eventBus.emit({
					type: "offer_choice:pending",
					resolveId,
					prompt: params.prompt,
					choices: params.choices,
					multiple: params.multiple ?? false,
				});
			});
		},
	};
}
