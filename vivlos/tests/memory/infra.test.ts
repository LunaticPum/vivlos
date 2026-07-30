import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMemoryEventLogger } from "@vivlos/agent/memory/utils/event-logger.ts";
import {
	createEventBus,
	type MemoryOperationEvent,
} from "@vivlos/infra/eventbus/index.ts";
import { initLogger } from "@vivlos/infra/logger/index.ts";
import { createMemoryRepository } from "@vivlos/infra/storage/memory/index.ts";

const LIMITS = { memory: 100, user: 100 } as const;

let sessionDir: string;

beforeEach(() => {
	sessionDir = mkdtempSync(join(tmpdir(), "vivlos-memory-infra-"));
});

afterEach(() => {
	rmSync(sessionDir, { recursive: true, force: true });
});

function operationEvent(
	overrides: Partial<MemoryOperationEvent> = {},
): MemoryOperationEvent {
	return {
		type: "memory:operation",
		eventId: "event-1",
		timestamp: 1,
		sessionId: "session-1",
		actor: "main",
		action: "add",
		outcome: "committed",
		file: "memory",
		reasonCode: "explicit_user_request",
		revisionBefore: "sha256:before",
		revisionAfter: "sha256:after",
		...overrides,
	};
}

describe("MemoryRepository", () => {
	it("空 session 不创建文件，首次写入后返回规范化 snapshot", () => {
		const repository = createMemoryRepository(sessionDir, LIMITS);
		const initial = repository.readSnapshot();
		expect(initial.entries).toEqual({ memory: [], user: [] });
		expect(existsSync(join(sessionDir, "memory.md"))).toBe(false);

		const result = repository.write("memory", [" first ", "second"]);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.entries.memory).toEqual(["first", "second"]);
		expect(result.value.revision).not.toBe(initial.revision);
		expect(result.value.usage.memory.used).toBe("first\n---\nsecond\n".length);
		expect(readFileSync(join(sessionDir, "memory.md"), "utf-8")).toBe(
			"first\n---\nsecond\n",
		);
	});

	it("兼容 CRLF，并拒绝分隔符注入和超出 cap 的写入", () => {
		writeFileSync(join(sessionDir, "user.md"), "alpha\r\n---\r\nbeta\r\n");
		const repository = createMemoryRepository(sessionDir, LIMITS);
		expect(repository.readSnapshot().entries.user).toEqual(["alpha", "beta"]);

		const invalid = repository.write("memory", ["safe", "---"]);
		expect(invalid.ok).toBe(false);
		if (!invalid.ok) expect(invalid.error.code).toBe("invalid_entry");
		expect(existsSync(join(sessionDir, "memory.md"))).toBe(false);

		const limited = createMemoryRepository(sessionDir, { memory: 3, user: 100 });
		const exceeded = limited.write("memory", ["long"]);
		expect(exceeded.ok).toBe(false);
		if (!exceeded.ok) expect(exceeded.error.code).toBe("capacity_exceeded");
	});
});

describe("MemoryEventLogger", () => {
	it("只追加 memory:operation，并在 dispose 后停止写入", () => {
		const eventBus = createEventBus();
		const dispose = createMemoryEventLogger(eventBus, () => sessionDir);
		const filePath = join(sessionDir, "memory-events.jsonl");

		eventBus.emit({
			type: "memory:changed",
			sessionId: "session-1",
			file: "memory",
			revisionBefore: "sha256:before",
			revisionAfter: "sha256:after",
		});
		expect(existsSync(filePath)).toBe(false);

		eventBus.emit(operationEvent());
		expect(JSON.parse(readFileSync(filePath, "utf-8"))).toMatchObject({
			type: "memory:operation",
			eventId: "event-1",
		});

		dispose();
		dispose();
		eventBus.emit(operationEvent({ eventId: "event-2" }));
		expect(readFileSync(filePath, "utf-8").trim().split("\n")).toHaveLength(1);
	});

	it("写入失败只发送 error log，不抛给 EventBus 调用方", () => {
		const eventBus = createEventBus();
		initLogger(eventBus);
		const messages: string[] = [];
		eventBus.on("log", (event) => {
			messages.push(event.message);
		});
		createMemoryEventLogger(eventBus, () => {
			throw new Error("session not found");
		});

		expect(() => eventBus.emit(operationEvent())).not.toThrow();
		expect(messages.some((message) => message.includes("Memory Event 留痕失败"))).toBe(
			true,
		);
	});
});
