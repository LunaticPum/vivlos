import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTodoTools } from "@vivlos/agent/tools/advanced/todo/todo.ts";
import { createEventBus } from "@vivlos/infra/eventbus/index.ts";
import { ToolError } from "@vivlos/shared";

let sessionDir: string;
let tools: AgentTool<any, any>[];

beforeEach(() => {
	sessionDir = mkdtempSync(join(tmpdir(), "vivlos-todo-tool-"));
	tools = createTodoTools({
		eventBus: createEventBus(),
		getSessionId: () => "session-a",
		getSessionDir: () => sessionDir,
		tasksDir: join(sessionDir, "tasks"),
	});
});

afterEach(() => {
	rmSync(sessionDir, { recursive: true, force: true });
});

function tool(name: string): AgentTool<any, any> {
	const found = tools.find((candidate) => candidate.name === name);
	if (!found) throw new Error(`Missing tool: ${name}`);
	return found;
}

describe("Todo Tool arguments", () => {
	it("TODO-001 接受真实 Item 数组", async () => {
		const result = await tool("todo_write").execute("call-write", {
			description: "真实数组",
			items: [{ content: "第一项", priority: "high" }],
		});

		expect(result.details).toMatchObject({
			operation: "write",
			todoList: {
				description: "真实数组",
				items: [{ content: "第一项", priority: "high", status: "pending" }],
			},
		});
	});

	it("TODO-002 兼容合法的字符串化 Item 数组", async () => {
		const write = tool("todo_write");
		const prepared = write.prepareArguments?.({
			description: "兼容输入",
			items: '[{"content":"第一项","priority":"medium"}]',
		});

		expect(prepared).toMatchObject({
			items: [{ content: "第一项", priority: "medium" }],
		});
		const result = await write.execute("call-write", prepared as never);
		expect(result.details).toMatchObject({ operation: "write" });
	});

	it("TODO-003 拒绝损坏的字符串化 Item 数组并给出定向错误", () => {
		const replace = tool("todo_replace");

		expect(() => replace.prepareArguments?.({
			description: "损坏输入",
			items: '[{"content":"第一项","priority":medium}]',
		})).toThrowError(ToolError);
		expect(() => replace.prepareArguments?.({
			description: "损坏输入",
			items: '[{"content":"第一项","priority":medium}]',
		})).toThrow('items 必须直接传 JSON 数组，不要传字符串；priority 必须是 "high"、"medium" 或 "low"');
	});

	it("TODO-004 拒绝解析后不是数组的字符串", () => {
		expect(() => tool("todo_write").prepareArguments?.({
			description: "错误结构",
			items: '{"content":"第一项"}',
		})).toThrow("items 解析后必须是 JSON 数组");
	});
});
