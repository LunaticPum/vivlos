import { describe, it, expect } from "vitest";
import { shortId, uid } from "../utils/id.ts";

describe("id", () => {
	it("shortId() 返回 8 位随机 uuid", () => {
		const id = shortId();
		expect(id).toHaveLength(8);
	});

	it("shortId() 应当能生成随机且唯一的 id", () => {
		const ids = new Set(Array.from({ length: 100 }, () => shortId()));
		expect(ids.size).toBe(100);
	});

	it("uid() 返回完整 uuid", () => {
		const id = uid();
		expect(id).toHaveLength(36);
		expect(id[8]).toBe("-"); // UUID 在第 8 位会有 - 分隔
	});
});
