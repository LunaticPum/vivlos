/**
 * 委派工具白名单测试。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

import {
	filterToolsForKind,
	getToolNamesForKind,
} from "@vivlos/agent/delegation/tool-policy.ts";

function fakeTool(name: string): AgentTool<any, any> {
	return {
		name,
		label: name,
		description: name,
		parameters: Type.Object({}),
		async execute() {
			return { content: [{ type: "text", text: "ok" }], details: {} };
		},
	};
}

const ALL_TOOLS = [
	"read",
	"write",
	"bash",
	"ls",
	"grep",
	"find",
	"skill",
	"delegate",
	"todo_read",
	"memory",
	"offer_choice",
	"session_search",
].map(fakeTool);

describe("Delegation tool policy", () => {
	it("DEL-POL-001 exploring 白名单只读", () => {
		expect(getToolNamesForKind("exploring")).toEqual([
			"read",
			"ls",
			"grep",
			"find",
			"skill",
		]);
	});

	it("DEL-POL-002 writing 白名单含写入与执行", () => {
		expect(getToolNamesForKind("writing")).toEqual([
			"read",
			"write",
			"bash",
			"ls",
			"grep",
			"find",
			"skill",
		]);
	});

	it("DEL-POL-003 过滤排除委派/计划/记忆类工具", () => {
		const exploring = filterToolsForKind("exploring", ALL_TOOLS).map(
			(tool) => tool.name,
		);
		const writing = filterToolsForKind("writing", ALL_TOOLS).map(
			(tool) => tool.name,
		);

		expect(exploring).toEqual(["read", "ls", "grep", "find", "skill"]);
		expect(writing).toEqual(["read", "write", "bash", "ls", "grep", "find", "skill"]);
		for (const name of ["delegate", "todo_read", "memory", "offer_choice", "session_search"]) {
			expect(exploring).not.toContain(name);
			expect(writing).not.toContain(name);
		}
	});
});
