import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "templates");

/**
 * 从 templates/ 目录加载 MD 文件。
 * 失败时返回 fallback，确保系统可启动。
 */
function loadTemplate(name: string, fallback: string): string {
	try {
		return readFileSync(resolve(TEMPLATES_DIR, name), "utf-8").trim();
	} catch {
		return fallback;
	}
}

export const DEFAULT_IDENTITY = loadTemplate("identity.md", "你是 vivlos，一个个人 AI 助手。");

export const DEFAULT_RULES = loadTemplate("rules.md", "- 回答简洁直接\n- 不确定时主动提问");

/**
 * 动态生成 environment 段落。
 *
 * 每次 prompt build 时调用，包含实时时间、时区、OS 等信息。
 */
export function buildEnvironment(): string {
	const now = new Date();
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const timeStr = now.toLocaleString("zh-CN", { timeZone: timezone });
	const platform = process.platform;
	const bunVersion = (process.versions as Record<string, string>).bun;
	const runtime = bunVersion ? `Bun ${bunVersion}` : `Node.js ${process.version}`;
	const cwd = process.cwd();

	return [
		`运行时：${runtime}`,
		`操作系统：${platform}`,
		`工作目录：${cwd}`,
		`当前时间：${timeStr} (${timezone})`,
		`回复语言：中文（跟随用户输入语言）`,
	].join("\n");
}
