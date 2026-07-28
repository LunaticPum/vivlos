/**
 * L1 Prompt 渲染测试。
 *
 * 只验证当前 snapshot 到 Prompt 数据块的转换，不启动 Agent Loop 或 Runtime。
 */

import { describe, expect, it } from "vitest";

import { buildL1Prompt } from "@vivlos/agent/memory-refactor/index.ts";
import type { MemoryStorageSnapshot } from "@vivlos/infra/storage/memory/index.ts";

function snapshot(
	overrides: Partial<MemoryStorageSnapshot> = {},
): MemoryStorageSnapshot {
	return {
		entries: { memory: ["Project uses <TypeScript> & Bun."], user: ["Short answers."] },
		usage: {
			memory: { used: 30, cap: 100 },
			user: { used: 16, cap: 80 },
		},
		revision: "revision",
		...overrides,
	};
}

describe("L1 Prompt", () => {
	it("MEM-L1-001 渲染 memory/user 文件块、usage 和 XML 转义", () => {
		const result = buildL1Prompt(snapshot());

		expect(result).toContain("MEMORY");
		expect(result).toContain("USER PROFILE");
		expect(result).toContain('<memory_file name="memory" used="30" cap="100">');
		expect(result).toContain("Project uses &lt;TypeScript&gt; &amp; Bun.");
		expect(result).not.toContain("<TypeScript>");
	});

	it("MEM-L1-002 空 L1 返回空字符串，不残留旧内容", () => {
		const empty = snapshot({
			entries: { memory: [], user: [] },
			usage: {
				memory: { used: 0, cap: 100 },
				user: { used: 0, cap: 80 },
			},
		});

		expect(buildL1Prompt(empty)).toBe("");
	});
});
