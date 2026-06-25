// ============================================================
// 基础消息类型
// ============================================================

export interface TextContent {
	type: "text";
	text: string;
}

export type ContentBlock = TextContent;

// ============================================================
// 消息类型（兼容 OpenAI 格式）
// ============================================================

export interface UserMessage {
	role: "user";
	content: string;
}

export interface SystemMessage {
	role: "system";
	content: string;
}

export interface AssistantMessage {
	role: "assistant";
	content: string;
	tool_calls?: ToolCall[];
}

export interface ToolMessage {
	role: "tool";
	content: string;
	tool_call_id: string;
}

export type Message =
	| UserMessage
	| SystemMessage
	| AssistantMessage
	| ToolMessage;

// ============================================================
// 工具调用类型
// ============================================================

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export interface ToolResult {
	tool_call_id: string;
	content: string;
	isError?: boolean;
}

// ============================================================
// LLM 通信类型
// ============================================================

export interface Usage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface ChatOptions {
	model: string;
	message: Message[];
	tools?: ToolDefinition[];
	signal?: AbortSignal;
}

// 四种流式通信事件
export type ChatEvent =
	| { type: "text_delta"; delta: string } // 事件A: LLM 输出纯文本内容
	| { type: "tool_calls"; delta: ToolCall[] } // 事件B: LLM 输出工具调用内容
	| { type: "done"; usage?: Usage } // 事件C: LLM 输出通信完成讯息，视情况输出 token 用量信息
	| { type: "error"; error: Error }; // 事件D: LLM 输出通信错误讯息

// ============================================================
// 工具系统类型
// ============================================================

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, unknown>;

	execute(
		input: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<string>;
}

export function defineTool(tool: ToolDefinition): ToolDefinition {
	return tool;
}
