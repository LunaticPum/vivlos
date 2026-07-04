/** 返回当前 Unix 时间戳（毫秒）. */
export function now(): number {
	return Date.now();
}

/** 休眠指定的毫秒数. */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
