import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import type { EventBus } from "@vivlos/infra/eventbus/index.ts";
import { log } from "@vivlos/infra/logger/index.ts";

export type ResolveMemorySessionDir = (sessionId: string) => string;

/**
 * 订阅 Memory 操作事件，并按 session 追加 best-effort JSONL 留痕。
 * 返回的 disposer 可重复调用。
 */
export function createMemoryEventLogger(
	eventBus: EventBus,
	resolveSessionDir: ResolveMemorySessionDir,
): () => void {
	const unsubscribe = eventBus.on("memory:operation", (event) => {
		try {
			const sessionDir = resolveSessionDir(event.sessionId);
			mkdirSync(sessionDir, { recursive: true });
			appendFileSync(
				resolve(sessionDir, "memory-events.jsonl"),
				`${JSON.stringify(event)}\n`,
				"utf-8",
			);
		} catch (error) {
			const cause = error instanceof Error ? error : new Error(String(error));
			log(
				"error",
				`Memory Event 留痕失败 (${event.sessionId}): ${cause.message}`,
				cause,
			);
		}
	});

	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		unsubscribe();
	};
}
