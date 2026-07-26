import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import {
	MEMORY_EVENT_SCHEMA_VERSION,
	type MemoryEvent,
} from "./types.ts";

export type MemoryEventDraft = Omit<
	MemoryEvent,
	"schemaVersion" | "eventId" | "seq" | "timestamp"
>;

export interface MemoryEventJournal {
	append(draft: MemoryEventDraft): MemoryEvent;
	readRange(fromSeq: number, toSeq: number): MemoryEvent[];
	countPendingCommitted(processedThrough: number): number;
}

// #region Journal 主入口

/** 创建绑定到单个 session 的 Memory Event Journal。 */
export function createMemoryEventJournal(
	sessionId: string,
	sessionDir: string,
): MemoryEventJournal {
	const filePath = resolve(sessionDir, "memory-events.jsonl");

	return {
		append(draft) {
			if (draft.sessionId !== sessionId) {
				throw new Error(
					`MemoryEvent sessionId 不匹配：expected=${sessionId}, actual=${draft.sessionId}`,
				);
			}

			const events = readEvents(filePath, sessionId);
			const event: MemoryEvent = {
				...draft,
				schemaVersion: MEMORY_EVENT_SCHEMA_VERSION,
				eventId: `evt-${randomUUID()}`,
				seq: (events.at(-1)?.seq ?? 0) + 1,
				timestamp: Date.now(),
			};

			mkdirSync(dirname(filePath), { recursive: true });
			appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf-8");
			return event;
		},

		readRange(fromSeq, toSeq) {
			validateRange(fromSeq, toSeq);
			return readEvents(filePath, sessionId).filter(
				(event) => event.seq >= fromSeq && event.seq <= toSeq,
			);
		},

		countPendingCommitted(processedThrough) {
			if (!Number.isSafeInteger(processedThrough) || processedThrough < 0) {
				throw new Error("processedThrough 必须是非负安全整数");
			}
			return readEvents(filePath, sessionId).filter(
				(event) =>
					event.seq > processedThrough &&
					event.actor === "main" &&
					event.status === "committed",
			).length;
		},
	};
}

// #endregion

// #region JSONL 读取与校验

function readEvents(filePath: string, sessionId: string): MemoryEvent[] {
	if (!existsSync(filePath)) return [];
	const lines = readFileSync(filePath, "utf-8").split(/\r?\n/);
	const events: MemoryEvent[] = [];

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!.trim();
		if (!line) continue;
		let event: MemoryEvent;
		try {
			event = JSON.parse(line) as MemoryEvent;
		} catch {
			throw new Error(`MemoryEvent JSONL 第 ${index + 1} 行不是有效 JSON`);
		}
		validateStoredEvent(event, sessionId, events.length + 1, index + 1);
		events.push(event);
	}
	return events;
}

function validateStoredEvent(
	event: MemoryEvent,
	sessionId: string,
	expectedSeq: number,
	lineNumber: number,
): void {
	if (event.schemaVersion !== MEMORY_EVENT_SCHEMA_VERSION) {
		throw new Error(`MemoryEvent JSONL 第 ${lineNumber} 行 schemaVersion 不支持`);
	}
	if (event.sessionId !== sessionId) {
		throw new Error(`MemoryEvent JSONL 第 ${lineNumber} 行 sessionId 不匹配`);
	}
	if (event.seq !== expectedSeq) {
		throw new Error(
			`MemoryEvent JSONL 第 ${lineNumber} 行 seq 不连续：expected=${expectedSeq}, actual=${event.seq}`,
		);
	}
}

function validateRange(fromSeq: number, toSeq: number): void {
	if (
		!Number.isSafeInteger(fromSeq) ||
		!Number.isSafeInteger(toSeq) ||
		fromSeq < 1 ||
		toSeq < fromSeq
	) {
		throw new Error("Event 区间必须满足 1 <= fromSeq <= toSeq 且均为安全整数");
	}
}

// #endregion
