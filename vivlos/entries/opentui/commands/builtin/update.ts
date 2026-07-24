/**
 * /update -- 更新 pi-ai 包（获取新 provider 支持）
 *
 * 检测包管理器（bun.lock 存在 -> bun，否则 npm），
 * 执行安装最新版，完成后 log() 通知并提示重启。
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { log } from "@vivlos/infra/logger/logger.ts";
import type { TUICommand } from "../types.ts";

const PI_AI_PKG = "@earendil-works/pi-ai";

/** 检测包管理器：bun.lock 存在用 bun，否则 npm */
function detectPackageManager(): "bun" | "npm" {
	return existsSync(resolve(process.cwd(), "bun.lock")) ? "bun" : "npm";
}

export const updateCommand: TUICommand = {
	name: "update",
	description: "更新 pi-ai 包（获取新 provider 支持）",
	execute: () => {
		const pm = detectPackageManager();

		log("warn", `正在更新 ${PI_AI_PKG}（${pm}）...`, undefined, true);

		const child = spawn(pm, ["install", `${PI_AI_PKG}@latest`], {
			cwd: process.cwd(),
			// stdout 不需要，ignore 防止 Windows 下管道阻塞导致 close 事件不触发
			stdio: ["ignore", "ignore", "pipe"],
			windowsHide: true,
		});

		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

		child.on("close", (code) => {
			if (code === 0) {
				log("info", `${PI_AI_PKG} 更新完成，请重启应用以加载新 provider`, undefined, true);
			} else {
				log("error", `更新失败（exit ${code}）：${stderr.slice(0, 200)}`, undefined, true);
			}
		});

		child.on("error", (err) => {
			log("error", `更新失败：${err.message}`, undefined, true);
		});
	},
};
