import { describe, it, expect } from "vitest";
import { now, sleep } from "../utils/time.ts";

describe("time", () => {
	it("now() 应返回正数时间戳", () => {
		const t = now();
		expect(t).toBeGreaterThan(0);
	});

	it("sleep() 应等待至少指定的时间", async () => {
		const start = now();
		await sleep(100);
		const elapsed = now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(90); // 允许 10ms 误差
	});
});
