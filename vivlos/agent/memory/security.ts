import type { MainMemoryReasonCode } from "./types.ts";

// #region 安全类型

export type MemorySecurityViolationType =
	| "invalid_input"
	| "unsafe_content"
	| "forbidden_operation";

export type MemorySecurityViolationCode =
	| "empty_content"
	| "separator_injection"
	| "prompt_injection"
	| "credential_exposure"
	| "invisible_unicode"
	| "operation_not_allowed"
	| "reason_not_allowed"
	| "reason_too_long";

export interface MemorySecurityViolation {
	readonly type: MemorySecurityViolationType;
	readonly code: MemorySecurityViolationCode;
	readonly message: string;
}

export type MemorySecurityActor = "main" | "consolidator";

export type MemorySecurityAction =
	| "add"
	| "replace"
	| "remove"
	| "refine"
	| "merge"
	| "noop";

export interface MemorySecurityOperation {
	readonly actor: MemorySecurityActor;
	readonly action: MemorySecurityAction;
	readonly reasonCode?: string;
}

export interface MemorySecurity {
	/** 扫描准备持久化的单条记忆内容 */
	scanCandidate(content: string): MemorySecurityViolation[];
	/** 检查调用方是否拥有指定操作权限 */
	validateOperation(operation: MemorySecurityOperation): MemorySecurityViolation[];
	/** 转义准备嵌入 XML Prompt 数据区块的内容 */
	escapeForPrompt(content: string): string;
}

// #endregion

// #region 扫描规则

/** 独立的 Markdown 分隔行会破坏条目边界 */
const SEPARATOR_LINE = /^[ \t]*---[ \t]*$/m;

/** 会改变未来 session 行为的常见 prompt injection 模式 */
const INJECTION_PATTERNS: RegExp[] = [
	/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
	/you\s+are\s+now\s+/i,
	/disregard\s+(all\s+)?(previous|prior|above)/i,
	/system\s*:\s*/i,
	/\[INST\]|\[\/INST\]|<<SYS>>|<\|im_start\|>/i,
];

/** 不允许持久化到 System Prompt 的常见凭证模式 */
const CREDENTIAL_PATTERNS: RegExp[] = [
	/BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY/i,
	/\bsk-[a-zA-Z0-9]{20,}/,
	/\bapi[_-]?key\s*[:=]\s*\S+/i,
	/\bpassword\s*[:=]\s*\S+/i,
	/\bsecret\s*[:=]\s*\S+/i,
	/\bAKIA[0-9A-Z]{16}/,
];

/** 人眼难以审计、但可能改变模型输入语义的不可见字符 */
const INVISIBLE_UNICODE = /[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/;

/** 主模型负责在线 CRUD；巩固模型只能强化和合并 */
const ALLOWED_ACTIONS: Record<MemorySecurityActor, ReadonlySet<MemorySecurityAction>> = {
	main: new Set(["add", "replace", "remove"]),
	consolidator: new Set(["add", "refine", "merge", "noop"]),
};

const MAIN_REASON_POLICY: Record<
	"add" | "replace" | "remove",
	ReadonlySet<MainMemoryReasonCode>
> = {
	add: new Set([
		"explicit_user_request",
		"user_correction",
		"stable_project_decision",
		"preference_observed",
	]),
	replace: new Set([
		"explicit_user_request",
		"user_correction",
		"stable_project_decision",
		"preference_observed",
	]),
	remove: new Set(["explicit_user_forget"]),
};

// #endregion

// #region Security 主入口

/** 创建无状态的 Memory 安全策略。 */
export function createMemorySecurity(): MemorySecurity {
	return {
		scanCandidate(content) {
			const violations: MemorySecurityViolation[] = [];
			if (!content) {
				violations.push(
					violation("invalid_input", "empty_content", "记忆内容不能为空"),
				);
				return violations;
			}

			if (SEPARATOR_LINE.test(content)) {
				violations.push(
					violation(
						"invalid_input",
						"separator_injection",
						"记忆内容不能包含独立的 --- 分隔行",
					),
				);
			}

			for (const pattern of INJECTION_PATTERNS) {
				if (pattern.test(content)) {
					violations.push(
						violation(
							"unsafe_content",
							"prompt_injection",
							`检测到 prompt injection 模式 (${pattern.source})`,
						),
					);
					break;
				}
			}

			for (const pattern of CREDENTIAL_PATTERNS) {
				if (pattern.test(content)) {
					violations.push(
						violation(
							"unsafe_content",
							"credential_exposure",
							`检测到凭证模式 (${pattern.source})`,
						),
					);
					break;
				}
			}

			if (INVISIBLE_UNICODE.test(content)) {
				violations.push(
					violation(
						"unsafe_content",
						"invisible_unicode",
						"检测到不可见 Unicode 字符",
					),
				);
			}
			return violations;
		},

		validateOperation(operation) {
			const { actor, action, reasonCode } = operation;
			if (!ALLOWED_ACTIONS[actor].has(action)) {
				return [
					violation(
						"forbidden_operation",
						"operation_not_allowed",
						`${actor} 不允许执行 ${action} 操作`,
					),
				];
			}
			if (actor === "main") {
				const allowedReasons = MAIN_REASON_POLICY[action as keyof typeof MAIN_REASON_POLICY];
				if (!allowedReasons?.has(reasonCode as MainMemoryReasonCode)) {
					return [
						violation(
							"forbidden_operation",
							"reason_not_allowed",
							`${action} 不允许使用 reasonCode=${reasonCode ?? "(missing)"}`,
						),
					];
				}
			}
			return [];
		},

		escapeForPrompt(content) {
			return content
				.replaceAll("&", "&amp;")
				.replaceAll("<", "&lt;")
				.replaceAll(">", "&gt;");
		},
	};
}

// #endregion

// #region 结果构造

function violation(
	type: MemorySecurityViolationType,
	code: MemorySecurityViolationCode,
	message: string,
): MemorySecurityViolation {
	return { type, code, message };
}

// #endregion
