/**
 * 委派批次 XML 渲染与解析测试。
 */

import { describe, expect, it } from "vitest";

import {
	parseDelegationXml,
	renderDelegationXml,
} from "@vivlos/agent/delegation/xml.ts";
import type { DelegationBatchState } from "@vivlos/agent/delegation/types.ts";

function batch(overrides?: Partial<DelegationBatchState>): DelegationBatchState {
	return {
		phase: "done",
		tasks: [
			{
				id: "t1",
				kind: "exploring",
				title: "查找实现",
				state: "completed",
				startedAt: 1000,
				completedAt: 13_300,
				turns: 7,
				result: "结论：位于 runner.ts:42",
			},
			{
				id: "t2",
				kind: "writing",
				title: "修复 bug",
				state: "error",
				startedAt: 1000,
				completedAt: 5_000,
				turns: 3,
				error: "运行超时（15 分钟）",
			},
		],
		...overrides,
	};
}

describe("Delegation XML", () => {
	it("DEL-XML-001 渲染携带批次统计与任务属性", () => {
		const xml = renderDelegationXml(batch());

		expect(xml).toContain('<delegation tasks="2" completed="1" failed="1">');
		expect(xml).toContain('id="t1" kind="exploring" title="查找实现"');
		expect(xml).toContain('state="completed" turns="7" duration="12.3s"');
		expect(xml).toContain("<result>\n结论：位于 runner.ts:42\n\t\t</result>");
		expect(xml).toContain("<error>运行超时（15 分钟）</error>");
	});

	it("DEL-XML-002 turn_limited 同时携带部分结果与原因", () => {
		const xml = renderDelegationXml(
			batch({
				tasks: [
					{
						id: "t1",
						kind: "writing",
						title: "大任务",
						state: "turn_limited",
						startedAt: 0,
						completedAt: 2000,
						turns: 40,
						result: "部分进展",
						error: "达到轮次上限（40）",
					},
				],
			}),
		);

		expect(xml).toContain('state="turn_limited"');
		expect(xml).toContain("部分进展");
		expect(xml).toContain("达到轮次上限（40）");
	});

	it("DEL-XML-003 渲染-解析往返保持字段", () => {
		const parsed = parseDelegationXml(renderDelegationXml(batch()));

		expect(parsed).not.toBeNull();
		expect(parsed?.phase).toBe("done");
		expect(parsed?.tasks).toHaveLength(2);
		const [t1, t2] = parsed!.tasks;
		expect(t1.id).toBe("t1");
		expect(t1.kind).toBe("exploring");
		expect(t1.title).toBe("查找实现");
		expect(t1.state).toBe("completed");
		expect(t1.turns).toBe(7);
		expect(t1.completedAt).toBe(12_300);
		expect(t1.result).toBe("结论：位于 runner.ts:42");
		expect(t2.state).toBe("error");
		expect(t2.error).toBe("运行超时（15 分钟）");
		expect(t2.result).toBeUndefined();
	});

	it("DEL-XML-004 标题含引号与尖括号时往返不损坏", () => {
		const parsed = parseDelegationXml(
			renderDelegationXml(
				batch({
					tasks: [
						{
							id: "t1",
							kind: "exploring",
							title: 'a "b" <c>',
							state: "completed",
							startedAt: 0,
							completedAt: 100,
							turns: 1,
							result: "ok",
						},
					],
				}),
			),
		);

		expect(parsed?.tasks[0].title).toBe('a "b" <c>');
	});

	it("DEL-XML-005 非委派文本与非法状态返回 null", () => {
		expect(parseDelegationXml("普通工具结果")).toBeNull();
		expect(parseDelegationXml("<delegation></delegation>")).toBeNull();
		expect(
			parseDelegationXml(
				'<delegation><task id="t1" kind="exploring" title="x" state="weird" turns="1" duration="1s"/></delegation>',
			),
		).toBeNull();
		expect(
			parseDelegationXml(
				'<delegation><task id="t1" kind="unknown" title="x" state="completed" turns="1" duration="1s"/></delegation>',
			),
		).toBeNull();
	});
});
