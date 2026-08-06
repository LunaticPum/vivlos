/**
 * L2 Search 测试。
 *
 * 验证 AND/OR 查询降级、结果预算（条数/单 Session 上限/片段截断）
 * 与 FTS 查询构造的安全性。
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createL2Indexer } from "@vivlos/agent/memory/layers/l2/indexer.ts";
import {
	buildFtsQuery,
	createL2SearchService,
	makeSnippet,
} from "@vivlos/agent/memory/layers/l2/search.ts";
import { getL2Db } from "@vivlos/infra/storage/memory/l2-db.ts";
import { closeAll } from "@vivlos/infra/storage/db.ts";
import {
	appendEntry,
	createSession,
	ensureSession,
} from "@vivlos/infra/storage/session/index.ts";
import type { Database } from "bun:sqlite";

let root: string;
let previousCwd: string;
let db: Database;

beforeEach(() => {
	previousCwd = process.cwd();
	root = mkdtempSync(join(tmpdir(), "vivlos-l2-search-"));
	process.chdir(root);
	db = getL2Db(join(root, "memory.db"));
});

afterEach(() => {
	process.chdir(previousCwd);
	closeAll();
	try {
		rmSync(root, { recursive: true, force: true });
	} catch {
		// Windows 下 WAL 文件可能短暂占用，清理尽力而为
	}
});

function makeSession(
	messages: { role: "user" | "assistant"; text: string; timestamp: number }[],
	name?: string,
): string {
	const { header, filePath } = createSession(name ?? null);
	ensureSession(header, filePath);
	for (const message of messages) {
		appendEntry(filePath, {
			type: "message",
			role: message.role,
			content: [{ type: "text", text: message.text }],
			timestamp: message.timestamp,
		});
	}
	return header.id;
}

describe("buildFtsQuery", () => {
	it("多词用指定连接符拼接并加引号", () => {
		expect(buildFtsQuery("auth token", "AND")).toBe('"auth" AND "token"');
		expect(buildFtsQuery("auth token", "OR")).toBe('"auth" OR "token"');
	});

	it("双引号被转义，防止 FTS 语法注入", () => {
		expect(buildFtsQuery('a"b', "AND")).toBe('"a""b"');
	});

	it("空查询返回 null", () => {
		expect(buildFtsQuery("", "AND")).toBeNull();
		expect(buildFtsQuery("   ", "AND")).toBeNull();
	});
});

describe("makeSnippet", () => {
	it("短内容原样返回", () => {
		expect(makeSnippet("短内容", ["短"], 400)).toBe("短内容");
	});

	it("长内容以命中位置为中心截断", () => {
		const content = `${"x".repeat(300)}关键词${"y".repeat(300)}`;
		const snippet = makeSnippet(content, ["关键词"], 100);
		expect(snippet.length).toBeLessThanOrEqual(106);
		expect(snippet).toContain("关键词");
		expect(snippet.startsWith("...")).toBe(true);
		expect(snippet.endsWith("...")).toBe(true);
	});

	it("无命中时截取开头", () => {
		const content = "a".repeat(500);
		const snippet = makeSnippet(content, ["不存在"], 100);
		expect(snippet).toBe(`${"a".repeat(100)}...`);
	});
});

describe("createL2SearchService", () => {
	it("AND 匹配全部关键词", () => {
		makeSession([
			{ role: "user", text: "讨论认证 token 刷新策略", timestamp: 1000 },
			{ role: "user", text: "讨论部署流程", timestamp: 2000 },
		]);
		createL2Indexer(db).backfill();

		const result = createL2SearchService(db).search("认证 token");

		expect(result.mode).toBe("and");
		expect(result.hits).toHaveLength(1);
		expect(result.hits[0]?.snippet).toContain("认证");
	});

	it("AND 无结果时降级为 OR", () => {
		makeSession([
			{ role: "user", text: "讨论部署流程", timestamp: 1000 },
		]);
		createL2Indexer(db).backfill();

		const result = createL2SearchService(db).search("部署 不存在的词");

		expect(result.mode).toBe("or");
		expect(result.hits.length).toBeGreaterThan(0);
	});

	it("完全无结果返回 none", () => {
		makeSession([
			{ role: "user", text: "讨论部署流程", timestamp: 1000 },
		]);
		createL2Indexer(db).backfill();

		const result = createL2SearchService(db).search("zzz_qqq");

		expect(result.mode).toBe("none");
		expect(result.hits).toHaveLength(0);
		expect(result.sessionCount).toBe(0);
	});

	it("结果按时间倒序", () => {
		makeSession([
			{ role: "user", text: "关键词旧消息", timestamp: 1000 },
			{ role: "user", text: "关键词新消息", timestamp: 9000 },
		]);
		createL2Indexer(db).backfill();

		const result = createL2SearchService(db).search("关键词");

		expect(result.hits).toHaveLength(2);
		expect(result.hits[0]?.timestamp).toBe(9000);
		expect(result.hits[1]?.timestamp).toBe(1000);
	});

	it("limit 限制返回条数", () => {
		makeSession([
			{ role: "user", text: "重复词 alpha", timestamp: 1000 },
			{ role: "user", text: "重复词 beta", timestamp: 2000 },
			{ role: "user", text: "重复词 gamma", timestamp: 3000 },
		]);
		createL2Indexer(db).backfill();

		const result = createL2SearchService(db).search("重复词", { limit: 2 });

		expect(result.hits).toHaveLength(2);
	});

	it("同一 Session 最多返回 maxPerSession 条", () => {
		makeSession([
			{ role: "user", text: "批量词 a", timestamp: 1000 },
			{ role: "user", text: "批量词 b", timestamp: 2000 },
			{ role: "user", text: "批量词 c", timestamp: 3000 },
		]);
		createL2Indexer(db).backfill();

		const result = createL2SearchService(db).search("批量词", {
			maxPerSession: 2,
		});

		expect(result.hits).toHaveLength(2);
	});

	it("片段按 snippetChars 截断", () => {
		makeSession([
			{ role: "user", text: `头部 ${"填充".repeat(200)} 尾部`, timestamp: 1000 },
		]);
		createL2Indexer(db).backfill();

		const result = createL2SearchService(db).search("头部", {
			snippetChars: 50,
		});

		expect(result.hits[0]!.snippet.length).toBeLessThanOrEqual(56);
	});

	it("空查询返回空结果", () => {
		const result = createL2SearchService(db).search("   ");
		expect(result.mode).toBe("none");
		expect(result.hits).toHaveLength(0);
	});
});
