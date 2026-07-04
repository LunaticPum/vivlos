import { describe, it, expect } from "vitest";
import {
	VivlosError,
	ConfigError,
	LLMError,
	ToolError,
	SessionError,
} from "../errors.ts";

describe("VivlosError", () => {
	it("创建基础错误时有正确的名称", () => {
		const e = new VivlosError("msg");
		expect(e.name).toBe("VivlosError");
		expect(e.message).toBe("msg");
		expect(e).toBeInstanceOf(Error);
	});
	it("包装错误原因", () => {
		const cause = new Error("inner");
		const e = new VivlosError("outer", cause);
		expect(e.cause).toBe(cause);
	});
});

describe("subclasses", () => {
	it("SessionError 应是 VivlosError 的子类", () => {
		const e = new SessionError("session lost");
		expect(e).toBeInstanceOf(VivlosError);
	});
	it("ConfigError 应是 VivlosError 的子类，且携带 name 信息", () => {
		const e = new ConfigError("bad config");
		expect(e.name).toBe("ConfigError");
		expect(e).toBeInstanceOf(VivlosError);
	});
	it("LLMError 应携带 provider 信息", () => {
		const e = new LLMError("timeout", "openai");
		expect(e.provider).toBe("openai");
	});
	it("ToolError 应携带 toolName 信息", () => {
		const e = new ToolError("not found", "read_file");
		expect(e.toolName).toBe("read_file");
	});
});
