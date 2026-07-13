/**
 * 内置指令注册入口
 *
 * 由 ChatPanel 懒初始化时调用，将所有内置 slash 命令注册到 registry。
 */

import type { TUICommandRegistry } from "../registry.ts";
import { modelsCommand } from "./models.ts";
import { providersCommand } from "./providers.ts";
import { detailCommand } from "./detail.ts";
import { helpCommand } from "./help.ts";

export function registerBuiltinCommands(registry: TUICommandRegistry): void {
	registry.register(modelsCommand);
	registry.register(providersCommand);
	registry.register(detailCommand);
	registry.register(helpCommand);
}
