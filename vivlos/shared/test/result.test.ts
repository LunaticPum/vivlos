import { describe, it, expect } from "vitest";
import { ok, err, getOrThrow, toError } from "../result.ts";

describe("Result", () => {
	it("ok() 返回执行成功结果", () => {
		const r = ok(42);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.value).toBe(42);
	});
	it("err() 返回执行失败结果", () => {
		const r = err("boom");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toBe("boom");
	});

	it("getOrThrow() 获取执行成功结果的值", () => {
		expect(getOrThrow(ok("hi"))).toBe("hi");
	});

	it("getOrThrow() 将执行失败结果的值抛出", () => {
		expect(() => getOrThrow(err("fail"))).toThrow("fail");
	});
});

describe("toError", () => {
	it("toError() 如果执行失败结果的值是 Error 类型，则正常抛出", () => {
		const e = new Error("test");
		expect(toError(e)).toBe(e);
	});

	it("toError() 如果执行失败结果的值不是 Error 类型，则先封装为 Error 类型再抛出", () => {
		expect(toError("msg").message).toBe("msg");
	});
});
