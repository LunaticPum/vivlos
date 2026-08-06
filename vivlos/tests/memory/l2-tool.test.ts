/**
 * session_search Tool 测试。
 *
 * 使用临时 cwd 与临时 memory.db，验证参数校验、输出格式与来源锚点。
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createL2Indexer } from "@vivlos/agent/memory/layers/l2/indexer.ts";
import { createL2SearchService } from "@vivlos/agent/memory/layers/l2/search.ts";
import { createSessionSearchTool } from "@vivlos/agent/tools/advanced/session-search/session-search.ts";
import { ToolError } from "@vivlos/shared/errors.ts";
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
	root = mkdtempSync(join(tmpdir(), "vivlos-l2-tool-"));
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

function makeTool() {
	const searchService = createL2SearchService(db);
	return createSessionSearchTool({ getSearchService: () => searchService });
}

function seedSession(text: string, name?: string): string {
	const { header, filePath } = createSession(name ?? null);
	ensureSession(header, filePath);
	appendEntry(filePath, {
		type: "message",
		role: "user",
		content: [{ type: "text", text }],
		timestamp: 1754300000000,
	});
	return header.id;
}

describe("createSessionSearchTool", () => {
	it("返回带来源锚点的格式化结果", async () => {
		const sessionId = seedSession("讨论认证刷新策略", "认证调研");
		createL2Indexer(db).backfill();
		const tool = makeTool();

		const result = await tool.execute("call-1", { query: "认证" });

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("找到 1 条相关历史");
		expect(text).toContain(sessionId);
		expect(text).toContain("认证调研");
		expect(text).toContain(`锚点: ${sessionId}#L2`);
		expect(text).toContain("不可信背景数据");
		expect(result.details?.result.hits).toHaveLength(1);
	});

	it("无结果时返回提示文案", async () => {
		seedSession("讨论部署流程");
		createL2Indexer(db).backfill();
		const tool = makeTool();

		const result = await tool.execute("call-2", { query: "zzz_qqq" });

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain("未找到相关历史会话片段");
	});

	it("空白 query 抛出 ToolError", async () => {
		const tool = makeTool();
		await expect(tool.execute("call-3", { query: "   " })).rejects.toBeInstanceOf(
			ToolError,
		);
	});

	it("limit 参数生效", async () => {
		seedSession("批量词 a");
		seedSession("批量词 b");
		seedSession("批量词 c");
		createL2Indexer(db).backfill();
		const tool = makeTool();

		const result = await tool.execute("call-4", { query: "批量词", limit: 2 });

		expect(result.details?.result.hits).toHaveLength(2);
	});
});
