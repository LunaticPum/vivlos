/**
 * 指令派发器
 *
 * InputBar 的 handleSubmit 调用此函数：
 * - 输入以 / 开头 -> 查 registry -> 命中则执行，未命中返回 error
 * - 输入不以 / 开头 -> handled=false，作为普通消息提交给 agent
 */

import type { TUICommandRegistry } from "./registry.ts";
import type { CommandContext, CheckResult } from "./types.ts";

export function checkCommand(
	input: string,
	registry: TUICommandRegistry,
	ctx: CommandContext,
): CheckResult {
	if (!input.startsWith("/")) return { handled: false };

	const spaceIdx = input.indexOf(" ");
	const name = spaceIdx === -1 ? input.slice(1) : input.slice(1, spaceIdx);
	const args = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1);

	const cmd = registry.get(name);
	if (!cmd) {
		return { handled: true, error: `不存在指令 /${name}` };
	}

	cmd.execute(ctx, args);
	return { handled: true };
}
