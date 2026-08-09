/**
 * 子 agent 系统提示词与任务移交包测试。
 */

import { describe, expect, it } from "vitest";

import {
	buildSubagentSystemPrompt,
	buildTaskBrief,
} from "@vivlos/agent/delegation/prompts.ts";
import type { DelegationTaskSpec } from "@vivlos/agent/delegation/types.ts";

const BASE_SPEC: DelegationTaskSpec = {
	kind: "exploring",
	title: "查找会话存储实现",
	brief: "定位 history.jsonl 的写入路径，返回 file:line 证据。",
};

describe("Subagent system prompt", () => {
	it("DEL-PRM-001 exploring SP 携带只读纪律与环境块", () => {
		const prompt = buildSubagentSystemPrompt("exploring");

		expect(prompt).toContain("只读探索子代理");
		expect(prompt).toContain("禁止创建、修改、删除任何文件");
		expect(prompt).toContain("file:line 证据");
		expect(prompt).toContain("<environment>");
		expect(prompt).toContain("<cwd>");
	});

	it("DEL-PRM-002 writing SP 携带自证纪律", () => {
		const prompt = buildSubagentSystemPrompt("writing");

		expect(prompt).toContain("实现子代理");
		expect(prompt).toContain("必须自行验证");
		expect(prompt).toContain("禁止假装完成");
		expect(prompt).toContain("<environment>");
	});

	it("DEL-PRM-003 SP 不继承主会话 identity/memory/rules", () => {
		for (const kind of ["exploring", "writing"] as const) {
			const prompt = buildSubagentSystemPrompt(kind);
			expect(prompt).not.toContain("<identity>");
			expect(prompt).not.toContain("<memory>");
			expect(prompt).not.toContain("<rules>");
		}
	});
});

describe("Task brief", () => {
	it("DEL-PRM-004 移交包含 goal 与 details", () => {
		const brief = buildTaskBrief(BASE_SPEC);

		expect(brief).toContain("<task_brief>");
		expect(brief).toContain("<goal>查找会话存储实现</goal>");
		expect(brief).toContain(
			"<details>定位 history.jsonl 的写入路径，返回 file:line 证据。</details>",
		);
		expect(brief).not.toContain("<context>");
		expect(brief).not.toContain("<references>");
	});

	it("DEL-PRM-005 context 与 references 按需出现", () => {
		const brief = buildTaskBrief({
			...BASE_SPEC,
			context: "项目使用 Bun + TypeScript",
			references: ["vivlos/infra/storage/session/jsonl-repo.ts"],
		});

		expect(brief).toContain("<context>项目使用 Bun + TypeScript</context>");
		expect(brief).toContain(
			"<ref>vivlos/infra/storage/session/jsonl-repo.ts</ref>",
		);
	});

	it("DEL-PRM-006 空白 context 被忽略且内容转义", () => {
		const brief = buildTaskBrief({
			...BASE_SPEC,
			title: "a <b> & \"c\"",
			context: "   ",
		});

		expect(brief).toContain("<goal>a &lt;b&gt; &amp; \"c\"</goal>");
		expect(brief).not.toContain("<context>");
	});
});
