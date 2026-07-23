import type { Message, Usage } from "@earendil-works/pi-ai";
import type { CompressionConfig } from "@vivlos/infra/config/index.ts";
import type {
	CompactionResult,
	CompactorDeps,
	CompactionState,
} from "./types.ts";
import { cheapPrune } from "./pruner.ts";
import { summarize } from "./summarizer.ts";
import { getContextTokens } from "@vivlos/shared/utils/tokens.ts";
import { log } from "@vivlos/infra/logger/index.ts";

// ponytail: 粗估 token = JSON 字符数 / 4，偏高但安全
const CHARS_PER_TOKEN = 4;
// head 保留的消息条数（第一轮交换）
const HEAD_SIZE = 2;

// #region 类型

export interface CompactOptions {
	/** 当前消息列表 */
	messages: Message[];
	/** 模型上下文窗口大小 */
	contextWindow: number;
	/** 压缩器依赖（llm + model + config） */
	deps: CompactorDeps;
	/** 防抖状态（跨 turn 维护，函数内就地修改） */
	state: CompactionState;
	/** 取消信号 */
	signal?: AbortSignal;
	/** 强制压缩（跳过阈值检查和防抖，手动 /compact 时用） */
	force?: boolean;
}

// #endregion

// #region 主入口

/**
 * 上下文压缩主逻辑。
 *
 * 流程：阈值检查 -> 防抖检查 -> 廉价剪枝 -> 三段切 -> 摘要生成 -> 组装
 *
 * 就地修改 state（防抖计数/暂停标记/lastSummary）。
 */
export async function compact(
	options: CompactOptions,
): Promise<CompactionResult> {
	const { messages, contextWindow, deps, state, signal, force } = options;
	const { config } = deps;

	// --- 1. 阈值检查（force 时跳过） ---
	if (!force) {
		const lastUsage = findLastUsage(messages);
		if (!lastUsage) {
			// 首轮对话或无 assistant 回复，跳过压缩
			return noOpResult(messages);
		}
		const usedTokens = getContextTokens(lastUsage);
		const threshold = contextWindow * config.threshold;

		if (usedTokens < threshold) {
			return noOpResult(messages);
		}

		// --- 2. 防抖检查（force 时跳过） ---
		if (state.autoPaused) {
			log("info", "压缩已暂停（连续无效压缩），跳过自动触发");
			return noOpResult(messages);
		}
	}

	// --- 3. 廉价剪枝 ---
	const pruned = cheapPrune(messages);

	// --- 4. 三段切 ---
	const { head, middle, tail } = segment(pruned, contextWindow, config);

	// --- 5. middle 为空 = 无效压缩 ---
	if (middle.length === 0) {
		state.consecutiveNoOp++;
		if (state.consecutiveNoOp >= config.maxConsecutiveNoOp) {
			state.autoPaused = true;
			log("warn", `连续 ${state.consecutiveNoOp} 次无效压缩，自动暂停`);
		}
		return noOpResult(messages);
	}

	// --- 6. 旧摘要（增量更新，从 state.lastSummary 读取） ---
	const previousSummary = state.lastSummary;

	// --- 7. 摘要生成 ---
	const summary = await summarize({
		llm: deps.llm,
		model: deps.model,
		messages: middle,
		previousSummary: previousSummary ?? undefined,
		signal,
	});

	// --- 8. 组装新消息列表（head + tail，摘要不作为消息，放入 SP） ---
	const newMessages = [...head, ...tail];

	// --- 9. 更新防抖状态 ---
	state.consecutiveNoOp = 0;
	state.autoPaused = false;
	state.lastSummary = summary;

	log(
		"info",
		`压缩完成: ${middle.length} 条消息已压缩，摘要 ${summary.length} 字符，新列表 ${newMessages.length} 条`,
	);

	return {
		messages: newMessages,
		summary,
		compactedCount: middle.length,
		noOp: false,
	};
}

// #endregion

// #region 三段切

interface SegmentResult {
	head: Message[];
	middle: Message[];
	tail: Message[];
}

/**
 * 三段切：head（开头保留）+ middle（压缩）+ tail（最近保留）。
 *
 * - head: 前 HEAD_SIZE 条
 * - tail: 从后往前按 token 预算留，至少 protectLastN 条
 * - middle: head 和 tail 之间
 * - 保证 toolResult 不被拆到 tail 外（前面的 assistant 一起纳入）
 */
function segment(
	messages: Message[],
	contextWindow: number,
	config: CompressionConfig,
): SegmentResult {
	const threshold = contextWindow * config.threshold;
	const tailBudget = threshold * config.targetRatio;

	const headSize = Math.min(HEAD_SIZE, messages.length);
	const head = messages.slice(0, headSize);

	// tail: 从后往前，按 token 预算留
	let tailTokenEstimate = 0;
	let tailStart = messages.length;

	for (let i = messages.length - 1; i >= headSize; i--) {
		tailTokenEstimate += estimateTokensForMessage(messages[i]!);
		tailStart = i;

		// 达到预算且超过最低保护条数
		const tailCount = messages.length - tailStart;
		if (tailTokenEstimate >= tailBudget && tailCount >= config.protectLastN) {
			break;
		}
	}

	// 保证 tool 调用和结果不被拆开
	// 如果 tail 的第一条是 toolResult，把它前面的 assistant 也纳入 tail
	while (tailStart > headSize && messages[tailStart]?.role === "toolResult") {
		tailStart--;
	}

	const tail = messages.slice(tailStart);
	const middle = messages.slice(headSize, tailStart);

	return { head, middle, tail };
}

// #endregion

// #region token 估算

/**
 * 从消息列表中找最后一条 assistant 的 usage（精确 token 数）。
 * 没有 assistant 消息或无 usage 字段时返回 null。
 */
function findLastUsage(messages: Message[]): Usage | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i]!;
		if (msg.role === "assistant" && msg.usage) {
			return msg.usage;
		}
	}
	return null;
}

/** 估算单条消息的 token 数（JSON 字符数 / 4，仅用于 tail 预算分配） */
function estimateTokensForMessage(msg: Message): number {
	const json = JSON.stringify(msg.content);
	return Math.ceil(json.length / CHARS_PER_TOKEN);
}

// #endregion

// #region 工具函数

/** 构造无效压缩结果 */
function noOpResult(messages: Message[]): CompactionResult {
	return {
		messages,
		summary: "",
		compactedCount: 0,
		noOp: true,
	};
}

// #endregion
