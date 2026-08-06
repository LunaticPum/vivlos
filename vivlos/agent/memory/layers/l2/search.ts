/**
 * L2 Search：memory.db FTS5 查询与结果裁剪。
 *
 * 查询策略：多词隐式 AND → 无结果改 OR → 仍无结果返回空。
 * 结果预算：单次条数、单条片段长度、单 Session 条数均有上限。
 *
 * 见 docs/memory/S2-L2会话检索规范.md。
 */

import type { Database } from "bun:sqlite";
import { getL2Db } from "@vivlos/infra/storage/memory/l2-db.ts";
import { expandForQuery } from "./tokenize.ts";

// #region 契约

export interface L2SearchHit {
	readonly sessionId: string;
	readonly sessionName: string | null;
	readonly lineNo: number;
	readonly role: string;
	readonly snippet: string;
	readonly timestamp: number | null;
}

export interface L2SearchResult {
	readonly hits: readonly L2SearchHit[];
	readonly sessionCount: number;
	/** 实际命中的查询模式；none 表示无结果。 */
	readonly mode: "and" | "or" | "none";
}

export interface L2SearchOptions {
	/** 单次最多返回条数，默认 8，上限 20。 */
	readonly limit?: number;
	/** 单条片段最大字符数，默认 400。 */
	readonly snippetChars?: number;
	/** 同一 Session 最多返回条数，默认 5。 */
	readonly maxPerSession?: number;
}

export interface L2SearchService {
	search(query: string, options?: L2SearchOptions): L2SearchResult;
}

// #endregion

// #region 查询构造

/**
 * 分词并构造 FTS5 MATCH 表达式。
 *
 * 每个空白分隔词先做 CJK 展开（双字组合），再逐项加双引号，
 * 防止 FTS 语法注入；最终用指定连接符拼接。
 */
export function buildFtsQuery(
	query: string,
	joiner: "AND" | "OR",
): string | null {
	const terms = query
		.split(/\s+/)
		.map((term) => term.trim())
		.filter(Boolean);
	if (terms.length === 0) return null;
	const tokens: string[] = [];
	for (const term of terms) tokens.push(...expandForQuery(term));
	if (tokens.length === 0) return null;
	return tokens
		.map((token) => `"${token.replace(/"/g, '""')}"`)
		.join(` ${joiner} `);
}

/** 拆分出原始词项（用于片段定位，与 buildFtsQuery 保持一致）。 */
function splitTerms(query: string): string[] {
	return query.split(/\s+/).map((term) => term.trim()).filter(Boolean);
}

// #endregion

// #region 片段截取

/** 以首个命中词位置为中心截取片段。 */
export function makeSnippet(
	content: string,
	terms: readonly string[],
	maxChars: number,
): string {
	if (content.length <= maxChars) return content;
	const lower = content.toLowerCase();
	let pos = -1;
	for (const term of terms) {
		pos = lower.indexOf(term.toLowerCase());
		if (pos >= 0) break;
	}
	if (pos < 0) return `${content.slice(0, maxChars)}...`;
	const half = Math.floor(maxChars / 2);
	const start = Math.max(0, pos - half);
	const end = Math.min(content.length, start + maxChars);
	const prefix = start > 0 ? "..." : "";
	const suffix = end < content.length ? "..." : "";
	return `${prefix}${content.slice(start, end)}${suffix}`;
}

// #endregion

// #region 工厂

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const DEFAULT_SNIPPET_CHARS = 400;
const DEFAULT_MAX_PER_SESSION = 5;

interface SearchRow {
	session_id: string;
	name: string | null;
	line_no: number;
	role: string;
	content: string;
	timestamp: number | null;
}

export function createL2SearchService(db?: Database): L2SearchService {
	const database = db ?? getL2Db();
	const stmtSearch = database.prepare(`
		SELECT m.session_id, m.line_no, m.role, m.content, m.timestamp, s.name
		FROM l2_messages_fts
		JOIN l2_messages m ON m.id = l2_messages_fts.rowid
		JOIN l2_sessions s ON s.session_id = m.session_id
		WHERE l2_messages_fts MATCH ?
		ORDER BY COALESCE(m.timestamp, 0) DESC
		LIMIT ?
	`);

	const runQuery = (
		match: string,
		fetchLimit: number,
	): SearchRow[] =>
		stmtSearch.all(match, fetchLimit) as SearchRow[];

	return {
		search(query, options = {}) {
			const limit = Math.min(
				Math.max(options.limit ?? DEFAULT_LIMIT, 1),
				MAX_LIMIT,
			);
			const snippetChars = options.snippetChars ?? DEFAULT_SNIPPET_CHARS;
			const maxPerSession = options.maxPerSession ?? DEFAULT_MAX_PER_SESSION;
			const terms = splitTerms(query);

			const andQuery = buildFtsQuery(query, "AND");
			if (!andQuery) return { hits: [], sessionCount: 0, mode: "none" };

			let mode: L2SearchResult["mode"] = "and";
			let rows = runQuery(andQuery, limit * 3);
			if (rows.length === 0) {
				const orQuery = buildFtsQuery(query, "OR");
				rows = orQuery ? runQuery(orQuery, limit * 3) : [];
				mode = "or";
			}

			const perSession = new Map<string, number>();
			const hits: L2SearchHit[] = [];
			for (const row of rows) {
				if (hits.length >= limit) break;
				const count = perSession.get(row.session_id) ?? 0;
				if (count >= maxPerSession) continue;
				perSession.set(row.session_id, count + 1);
				hits.push({
					sessionId: row.session_id,
					sessionName: row.name,
					lineNo: row.line_no,
					role: row.role,
					snippet: makeSnippet(row.content, terms, snippetChars),
					timestamp: row.timestamp,
				});
			}

			if (hits.length === 0) return { hits: [], sessionCount: 0, mode: "none" };
			return {
				hits,
				sessionCount: perSession.size,
				mode,
			};
		},
	};
}

// #endregion
