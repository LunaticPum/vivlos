import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getConfigDir } from "../paths.ts";

const DEFAULT_PERMISSIONS_YML = `
# vivlos 权限配置
#
# bash 命令权限配置
# pattern 使用通配符，* 匹配任意字符，? 匹配单个字符
# 按顺序匹配，最后匹配到的规则生效
# action: allow | deny

bash:
  "rm -rf /*": deny
  "*": allow
`;

/**
 * 确保权限配置文件存在，不存在则生成默认配置。
 * 不会覆盖已有文件。
 */
export function ensurePermissionsConfig(): void {
	const filePath = resolve(getConfigDir(), "permissions.yml");
	if (!existsSync(filePath)) {
		writeFileSync(filePath, DEFAULT_PERMISSIONS_YML, "utf-8");
	}
}

/**
 * 确保所有默认配置文件存在。
 * 启动时调用，后续新增配置在此追加。
 */
export function ensureAllConfigs(): void {
	ensurePermissionsConfig();
}
