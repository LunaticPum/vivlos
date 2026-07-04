export type Result<TValue, TError> =
	| { ok: true; value: TValue }
	| { ok: false; error: TError };

/** 返回操作执行成功的结果 */
export function ok<TValue, TError = never>(
	value: TValue,
): Result<TValue, TError> {
	return { ok: true, value };
}

/** 返回操作执行失败的结果 */
export function err<TValue = never, TError = unknown>(
	error: TError,
): Result<TValue, TError> {
	return { ok: false, error };
}

/** 接收成功结果的值或抛出错误 */
export function getOrThrow<TValue, TError>(
	result: Result<TValue, TError>,
): TValue {
	if (!result.ok) throw result.error;
	return result.value;
}

/** 将所有执行失败的结果统一封装为 Error */
export function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "string") return new Error(error);
	try {
		return new Error(JSON.stringify(error));
	} catch {
		return new Error(String(error));
	}
}
