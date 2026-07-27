/**
 * Memory Consolidator 配置与模型解析测试。
 *
 * 配置读取绑定临时目录；模型解析只使用内存 fake，不读取 .env、凭证或真实 Provider。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Api, Model } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "@vivlos/infra/config/index.ts";
import { createEventBus, type VivlosEvent } from "@vivlos/infra/eventbus/index.ts";
import { resolveModel } from "@vivlos/infra/llm/provider.ts";
import { initLogger } from "@vivlos/infra/logger/index.ts";

let root: string;
let previousCwd: string;

beforeEach(() => {
	previousCwd = process.cwd();
	root = mkdtempSync(join(tmpdir(), "vivlos-memory-config-"));
	process.chdir(root);
});

afterEach(() => {
	process.chdir(previousCwd);
	rmSync(root, { recursive: true, force: true });
});

function writeConfig(value: unknown): void {
	const vivlosDir = join(root, ".vivlos");
	mkdirSync(vivlosDir, { recursive: true });
	writeFileSync(
		join(vivlosDir, "config.json"),
		`${JSON.stringify(value)}\n`,
		"utf-8",
	);
}

function model(provider: string, id: string): Model<Api> {
	return {
		provider,
		id,
		name: id,
		api: "faux" as Api,
		baseUrl: "http://localhost:0",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 10_000,
		maxTokens: 1_000,
	};
}

// #region Config

describe("Memory Consolidator config", () => {
	it("MEM-CFG-001 提供完整默认配置且保持原 Memory limit", () => {
		const config = loadConfig();

		expect(config.memory).toEqual({
			characterLimit: { memory: 2200, user: 1375 },
			consolidator: {
				model: null,
				trigger: { operations: 20, capacity: 0.85 },
				maxTurns: 6,
				maxTools: 8,
				timeoutMs: 60_000,
			},
		});
	});

	it("MEM-CFG-002 深层合并局部配置并规范化模型引用", () => {
		writeConfig({
			memory: {
				consolidator: {
					model: { provider: "  custom-provider ", id: " model-a  " },
					trigger: { operations: 7 },
					maxTools: 3,
				},
			},
		});

		expect(loadConfig().memory.consolidator).toEqual({
			model: { provider: "custom-provider", id: "model-a" },
			trigger: { operations: 7, capacity: 0.85 },
			maxTurns: 6,
			maxTools: 3,
			timeoutMs: 60_000,
		});
	});

	it("MEM-CFG-003 非法字段独立回退且不保留凭证或未知字段", () => {
		writeConfig({
			memory: {
				characterLimit: { memory: 0, user: 900 },
				consolidator: {
					model: {
						provider: " ",
						id: "model-a",
						apiKey: "SECRET_KEY",
						baseUrl: "https://secret.invalid",
					},
					trigger: { operations: 0, capacity: 2 },
					maxTurns: -1,
					maxTools: 1.5,
					timeoutMs: "fast",
					unknown: "drop-me",
				},
			},
		});

		const memory = loadConfig().memory;
		expect(memory.characterLimit).toEqual({ memory: 2200, user: 900 });
		expect(memory.consolidator).toEqual({
			model: null,
			trigger: { operations: 20, capacity: 0.85 },
			maxTurns: 6,
			maxTools: 8,
			timeoutMs: 60_000,
		});
		expect(JSON.stringify(memory)).not.toContain("SECRET_KEY");
		expect(JSON.stringify(memory)).not.toContain("secret.invalid");
		expect(memory.consolidator).not.toHaveProperty("unknown");
	});
});

// #endregion

// #region Model

describe("Memory Consolidator model resolution", () => {
	it("MEM-MOD-001 null 引用每次返回当次当前主模型", () => {
		const first = model("main", "first");
		const second = model("main", "second");
		const llm = { getModel: vi.fn() };

		expect(resolveModel(llm, null, first)).toEqual({ ok: true, value: first });
		expect(resolveModel(llm, null, second)).toEqual({ ok: true, value: second });
		expect(llm.getModel).not.toHaveBeenCalled();
	});

	it("MEM-MOD-002 精确解析已注册模型", () => {
		const current = model("main", "current");
		const configured = model("custom", "configured");
		const getModel = vi.fn((provider: string, id: string) =>
			provider === "custom" && id === "configured" ? configured : undefined,
		);

		const result = resolveModel(
			{ getModel },
			{ provider: "custom", id: "configured" },
			current,
		);

		expect(result).toEqual({ ok: true, value: configured });
		expect(getModel).toHaveBeenCalledWith("custom", "configured");
	});

	it("MEM-MOD-003 显式模型不存在时返回错误并发送 TUI 日志", () => {
		const eventBus = createEventBus();
		initLogger(eventBus);
		const logs: Extract<VivlosEvent, { type: "log" }>[] = [];
		eventBus.on("log", (event) => {
			logs.push(event);
		});
		const current = model("main", "current");

		const result = resolveModel(
			{ getModel: () => undefined },
			{ provider: "missing", id: "removed" },
			current,
		);

		expect(result).toEqual({
			ok: false,
			error: {
				code: "model_not_found",
				message: "找不到 Consolidator 模型：missing/removed",
			},
		});
		expect(logs).toContainEqual(
			expect.objectContaining({ level: "error", onTui: true }),
		);
		if (result.ok) throw new Error("expected model_not_found");
		expect(result.error.message).not.toContain(current.id);
	});
});

// #endregion
