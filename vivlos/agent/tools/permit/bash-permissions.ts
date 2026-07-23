import { loadConfig } from "@vivlos/infra/config/index.ts";

export interface BashRule {
	pattern: string;
	action: "allow" | "deny";
}

/**
 * 从 .vivlos/config.json 的 tool.bash 加载权限规则。
 * 文件不存在时返回 null（默认全 allow）。
 *
 * config.json 格式：
 * ```json
 * {
 *   "tool": {
 *     "bash": {
 *       "rm -rf /*": "deny",
 *       "*": "allow"
 *     }
 *   }
 * }
 * ```
 */
export function loadBashPermissions(): BashRule[] | null {
	const config = loadConfig();
	const bashRules = config.tool.bash;
	if (!bashRules || Object.keys(bashRules).length === 0) return null;

	const rules: BashRule[] = [];
	for (const [pattern, action] of Object.entries(bashRules)) {
		if (action === "allow" || action === "deny") {
			rules.push({ pattern, action });
		}
	}
	return rules.length > 0 ? rules : null;
}

/**
 * 通配符匹配：* 匹配任意字符，? 匹配单个字符。
 */
function wildcardMatch(pattern: string, text: string): boolean {
	const regex = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	return new RegExp(`^${regex}$`, "i").test(text);
}

/**
 * 检查 bash 命令是否被允许。
 * 按顺序匹配，最后匹配到的规则生效。无规则时默认 allow。
 */
export function checkBashPermission(
	command: string,
	rules: BashRule[] | null,
): { allowed: boolean; reason?: string } {
	if (!rules || rules.length === 0) return { allowed: true };

	let action: "allow" | "deny" = "allow";
	let matchedPattern = "*";
	for (const rule of rules) {
		if (wildcardMatch(rule.pattern, command)) {
			action = rule.action;
			matchedPattern = rule.pattern;
		}
	}

	if (action === "deny") {
		return {
			allowed: false,
			reason: `命令被权限规则拒绝 (matched: "${matchedPattern}")`,
		};
	}
	return { allowed: true };
}
