import type {
	Message,
	TextContent,
	ImageContent,
	ToolResultMessage,
	AssistantMessage,
} from "@earendil-works/pi-ai";

// #region 剪枝阈值

// ponytail: 阈值硬编码，后续可迁入 config.json
const TOOL_RESULT_MAX = 500;
const TOOL_RESULT_KEEP = 200;
const TOOL_CALL_ARG_MAX = 1000;
const TOOL_CALL_ARG_KEEP = 200;
const DEDUP_KEY_LEN = 100;

// #endregion

// #region 主入口

/**
 * 廉价剪枝：不调 LLM，直接对消息列表做预处理。
 *
 * 1. 长 toolResult 文本截断（bash 输出等）
 * 2. 重复 toolResult 去重（保留第一个，后续标记为重复）
 * 3. 大 toolCall 参数截断（write 工具写入大文件等）
 *
 * 返回新的消息列表（不修改原列表）。
 */
export function cheapPrune(messages: Message[]): Message[] {
	const seenResults = new Set<string>();
	const result: Message[] = [];

	for (const msg of messages) {
		if (msg.role === "toolResult") {
			result.push(handleToolResult(msg, seenResults));
		} else if (msg.role === "assistant") {
			result.push(handleAssistant(msg));
		} else {
			result.push(msg);
		}
	}

	return result;
}

// #endregion

// #region toolResult 处理

function handleToolResult(
	msg: ToolResultMessage,
	seenResults: Set<string>,
): Message {
	const text = extractText(msg.content);
	const dedupKey = text.slice(0, DEDUP_KEY_LEN);

	// 重复结果：替换为一行标记
	if (seenResults.has(dedupKey)) {
		return {
			...msg,
			content: [{ type: "text", text: "[重复的工具结果，见上方]" }],
		};
	}

	seenResults.add(dedupKey);

	// 长结果：截断
	if (text.length <= TOOL_RESULT_MAX) return msg;

	const truncated = text.slice(0, TOOL_RESULT_KEEP);
	const dropped = text.length - TOOL_RESULT_KEEP;
	return {
		...msg,
		content: [
			{ type: "text", text: `${truncated}\n...[${dropped} 字符已截断]` },
		],
	};
}

// #endregion

// #region assistant 处理

function handleAssistant(msg: AssistantMessage): Message {
	let changed = false;
	const newContent = msg.content.map((block) => {
		if (block.type === "toolCall") {
			const newArgs = pruneArgs(block.arguments);
			if (newArgs !== block.arguments) {
				changed = true;
				return { ...block, arguments: newArgs };
			}
		}
		return block;
	});

	return changed ? { ...msg, content: newContent } : msg;
}

/** 截断 toolCall 中过长的字符串参数（如 write 的 content） */
function pruneArgs(args: Record<string, unknown>): Record<string, unknown> {
	let changed = false;
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(args)) {
		if (typeof value === "string" && value.length > TOOL_CALL_ARG_MAX) {
			result[key] =
				value.slice(0, TOOL_CALL_ARG_KEEP) + `...[${value.length} 字符已截断]`;
			changed = true;
		} else {
			result[key] = value;
		}
	}
	return changed ? result : args;
}

// #endregion

// #region 工具函数

/** 从 content blocks 中提取纯文本 */
function extractText(content: readonly (TextContent | ImageContent)[]): string {
	return content
		.filter((c): c is TextContent => c.type === "text")
		.map((c) => c.text)
		.join("");
}

// #endregion
