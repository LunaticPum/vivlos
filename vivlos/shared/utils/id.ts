import { randomUUID } from "node:crypto";

/** 生成 8 位随机 uuid. */
export function shortId(): string {
	return randomUUID().slice(0, 8);
}

/** 生成不截断的随机 uuid. */
export function uid(): string {
	return randomUUID();
}
