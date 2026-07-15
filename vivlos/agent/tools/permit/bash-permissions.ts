import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { getConfigDir } from "@vivlos/infra/paths.ts";

export interface BashRule {
	pattern: string;
	action: "allow" | "deny";
}

/**
 * 加载 .vivlos/config/permissions.yml 中的 bash 权限规则。
 * 文件不存在时返回 null（默认全 allow）。
 *
 * 格式：
 * ```yaml
 * bash:
 *   "tvly *": allow
 *   "git *": allow
 *   "rm -rf *": deny
 *   "*": allow
 * ```
 */
export function loadBashPermissions(): BashRule[] | null {
	const filePath = resolve(getConfigDir(), "permissions.yml");
	if (!existsSync(filePath)) return null;

	try {
		const raw = readFileSync(filePath, "utf-8");
		const parsed = parseYaml(raw) as Record<string, unknown> | null;
		if (!parsed || typeof parsed !== "object") return null;

		const bashSection = parsed["bash"];
		if (!bashSection || typeof bashSection !== "object") return null;

		const rules: BashRule[] = [];
		for (const [pattern, action] of Object.entries(bashSection)) {
			if (action === "allow" || action === "deny") {
				rules.push({ pattern, action });
			}
		}
		return rules.length > 0 ? rules : null;
	} catch {
		return null;
	}
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
