/**
 * pi-ai 包版本检测。
 *
 * 启动时调用一次：同步读本地版本 + 异步查远端最新版本（2s 超时）。
 * 查询失败不阻塞启动，latest 为 null 时只显示本地版本。
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface PiAiVersionInfo {
	/** 本地安装版本 */
	current: string;
	/** 远端最新版本（查询失败为 null） */
	latest: string | null;
	/** 是否有可用更新 */
	hasUpdate: boolean;
}

const PI_AI_PKG = "@earendil-works/pi-ai";
const REGISTRY_URL = `https://registry.npmmirror.com/${PI_AI_PKG.replace("/", "%2F")}/latest`;
const TIMEOUT_MS = 2000;

/** 同步读取本地 pi-ai 版本号 */
export function getPiAiVersion(): string {
	try {
		const pkgPath = resolve(process.cwd(), "node_modules", PI_AI_PKG, "package.json");
		if (!existsSync(pkgPath)) return "unknown";
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
		return pkg.version ?? "unknown";
	} catch {
		return "unknown";
	}
}

/** 异步查询远端最新版本（2s 超时，失败返回 null） */
export async function getPiAiLatest(): Promise<string | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
		const res = await fetch(REGISTRY_URL, { signal: controller.signal });
		clearTimeout(timer);
		if (!res.ok) return null;
		const data = (await res.json()) as { version?: string };
		return data.version ?? null;
	} catch {
		return null;
	}
}

/** 组装完整版本信息（启动时调用一次） */
export async function checkPiAiVersion(): Promise<PiAiVersionInfo> {
	const current = getPiAiVersion();
	const latest = await getPiAiLatest();
	return {
		current,
		latest,
		hasUpdate: latest !== null && latest !== current,
	};
}
