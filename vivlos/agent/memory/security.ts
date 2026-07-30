import type { MemoryAction, MemoryActor } from "./types.ts";

/**
 * Memory 内容安全策略。
 *
 * 本脚本只处理准备持久化内容的安全检查，不负责参数完整性、
 * Markdown 文件读写、字符上限、重复判断或业务操作执行。
 */

// #region 安全结果

/** 内容扫描可能返回的稳定违规码。 */
export type SecurityViolationCode =
	| "separator_injection"
	| "prompt_injection"
	| "control_marker"
	| "credential_exposure"
	| "invisible_unicode"
	| "operation_not_allowed";

/** 单条安全违规，供 Service 转换成结构化业务结果。 */
export interface SecurityViolation {
	readonly code: SecurityViolationCode;
	readonly message: string;
}

// #endregion

// #region 扫描规则

/** 独立的 Markdown 分隔行会破坏 Repository 的条目边界。 */
const SEPARATOR_LINE = /^[ \t]*---[ \t]*$/m;

/** 试图覆盖已有指令或重新指定模型角色的常见表达。 */
const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
	/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
	/disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)?/i,
	/you\s+are\s+now\s+/i,
];

/** 不应作为长期事实写入的模型角色前缀和控制标记。 */
const CONTROL_MARKER_PATTERNS: readonly RegExp[] = [
	/^\s*(system|developer|tool)\s*:/im,
	/\[INST\]|\[\/INST\]|<<SYS>>|<\|im_start\|>|<\|im_end\|>/i,
	/<\/?(system|developer|tool)>/i,
];

/** 不允许持久化到未来 System Prompt 的常见凭证格式。 */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
	/BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY/i,
	/\bsk-[a-zA-Z0-9]{20,}/,
	/\bAKIA[0-9A-Z]{16}/,
	/\bBearer\s+[a-zA-Z0-9._~+\/-]{16,}=*/i,
	/\b(api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*\S+/i,
];

/** 零宽字符、双向文本控制符等难以由人眼审计的字符。 */
const INVISIBLE_UNICODE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/;

// #endregion

// #region 操作权限

/**
 * 主模型负责用户对话中的明确 CRUD。
 * merge/refine 属于巩固语义，不由主模型主动提交。
 */
const MAIN_ALLOWED_ACTIONS: ReadonlySet<MemoryAction> = new Set([
	"add",
	"replace",
	"remove",
]);

/**
 * 巩固模型只允许合并和精炼已有记忆。
 * 禁止 add/remove/replace，避免重新执行主模型的内容决策。
 */
const CONSOLIDATOR_ALLOWED_ACTIONS: ReadonlySet<MemoryAction> = new Set([
	"merge",
	"refine",
]);

/** actor 到允许操作集合的唯一权限映射。 */
const ALLOWED_ACTIONS: Readonly<Record<MemoryActor, ReadonlySet<MemoryAction>>> = {
	main: MAIN_ALLOWED_ACTIONS,
	consolidator: CONSOLIDATOR_ALLOWED_ACTIONS,
};

/** 检查操作主体是否拥有指定 action；允许时返回 null。 */
export function checkPermission(
	actor: MemoryActor,
	action: MemoryAction,
): SecurityViolation | null {
	if (ALLOWED_ACTIONS[actor].has(action)) return null;
	return {
		code: "operation_not_allowed",
		message: `${actor} 不允许执行 ${action} 操作`,
	};
}

// #endregion

// #region 内容扫描

/**
 * 扫描准备持久化的最终完整条目。
 *
 * 每个类别最多返回一条违规；同一内容可以同时命中多个类别。
 * 空内容属于 Memory logic 的参数校验，本函数返回空数组。
 */
export function scanContent(content: string): SecurityViolation[] {
	const violations: SecurityViolation[] = [];

	if (SEPARATOR_LINE.test(content)) {
		violations.push({
			code: "separator_injection",
			message: "Memory 内容不能包含独立的 --- 分隔行",
		});
	}

	if (matchesAny(content, PROMPT_INJECTION_PATTERNS)) {
		violations.push({
			code: "prompt_injection",
			message: "Memory 内容包含试图覆盖已有指令的表达",
		});
	}

	if (matchesAny(content, CONTROL_MARKER_PATTERNS)) {
		violations.push({
			code: "control_marker",
			message: "Memory 内容包含模型角色或控制标记",
		});
	}

	if (matchesAny(content, CREDENTIAL_PATTERNS)) {
		violations.push({
			code: "credential_exposure",
			message: "Memory 内容包含疑似凭证或私钥",
		});
	}

	if (INVISIBLE_UNICODE.test(content)) {
		violations.push({
			code: "invisible_unicode",
			message: "Memory 内容包含不可见 Unicode 控制字符",
		});
	}

	return violations;
}

// #endregion

// #region Prompt 结构转义

/**
 * 将原始 Memory 文本转义为可安全放入 XML 文本节点的内容。
 *
 * 调用方必须传入 Repository 中的未转义原文，并且只在构造 SP 时调用一次；
 * Repository 不应保存转义后的 HTML/XML 实体。
 */
export function escapeForPrompt(content: string): string {
	return content
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

// #endregion

// #region 内部辅助

/** 判断内容是否命中某一类规则，避免向调用方重复返回同类违规。 */
function matchesAny(content: string, patterns: readonly RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(content));
}

// #endregion
