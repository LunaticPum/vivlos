/**
 * L2 中文分词辅助。
 *
 * FTS5 默认 unicode61 分词器不对 CJK 分词，整段 CJK 会被当作单个 token。
 * 方案：索引时把 CJK 连续段展开为「单字 + 双字组合」，查询时把 CJK 词
 * 拆成双字组合（单字词保留单字），用 AND 连接得到近似子串匹配。
 *
 * 仅覆盖常见 CJK 区段（中日韩统一表意文字、扩展 A、兼容、假名、谚文）。
 */

const CJK_REGEX =
	/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]+/g;

/** 将一个 CJK 连续段展开为单字 + 双字组合。 */
function expandRun(run: string): string {
	const tokens: string[] = [];
	for (const char of run) tokens.push(char);
	for (let index = 0; index + 2 <= run.length; index++) {
		tokens.push(run.slice(index, index + 2));
	}
	return tokens.join(" ");
}

/**
 * 索引侧展开：CJK 段展开为单字+双字，非 CJK 文本原样保留。
 * 展开结果写入 tokens 列供 FTS 索引；原文仍保存在 content 列。
 */
export function expandForIndex(text: string): string {
	const parts: string[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(CJK_REGEX)) {
		const index = match.index ?? 0;
		if (index > lastIndex) parts.push(text.slice(lastIndex, index));
		parts.push(expandRun(match[0]));
		lastIndex = index + match[0].length;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));
	return parts.join(" ");
}

/**
 * 查询侧展开：CJK 段拆为双字组合（长度 1 时保留单字），
 * 非 CJK 段原样返回。返回值用于构造 FTS MATCH 词项。
 */
export function expandForQuery(term: string): string[] {
	const tokens: string[] = [];
	let lastIndex = 0;
	for (const match of term.matchAll(CJK_REGEX)) {
		const index = match.index ?? 0;
		if (index > lastIndex) tokens.push(term.slice(lastIndex, index));
		const run = match[0];
		if (run.length === 1) {
			tokens.push(run);
		} else {
			for (let i = 0; i + 2 <= run.length; i++) {
				tokens.push(run.slice(i, i + 2));
			}
		}
		lastIndex = index + run.length;
	}
	if (lastIndex < term.length) tokens.push(term.slice(lastIndex));
	return tokens.filter((token) => token.trim().length > 0);
}
