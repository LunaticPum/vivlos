/**
 * 委派批次结果的渲染与解析。
 *
 * 渲染产物是 delegate tool 的 toolResult 内容（进入主会话上下文，
 * 也是唯一随 history.jsonl 持久化的委派数据）；
 * 解析供历史重建（messagesToTurns）与 TUI 展示使用。
 */

import type {
	DelegationBatchState,
	DelegationTaskState,
	SubagentState,
	TaskKind,
} from "./types.ts";

const SUBAGENT_STATES: readonly SubagentState[] = [
	"completed",
	"turn_limited",
	"timeout",
	"aborted",
	"error",
];

/** 把批次结果渲染为 XML。 */
export function renderDelegationXml(batch: DelegationBatchState): string {
	const completed = batch.tasks.filter(
		(task) => task.state === "completed",
	).length;
	const failed = batch.tasks.length - completed;
	const lines = [
		`<delegation tasks="${batch.tasks.length}" completed="${completed}" failed="${failed}">`,
	];
	for (const task of batch.tasks) {
		lines.push(renderTaskXml(task));
	}
	lines.push("</delegation>");
	return lines.join("\n");
}

function renderTaskXml(task: DelegationTaskState): string {
	const durationS = task.completedAt
		? ((task.completedAt - task.startedAt) / 1000).toFixed(1)
		: "0.0";
	const attrs = [
		`id="${task.id}"`,
		`kind="${task.kind}"`,
		`title="${escapeAttr(task.title)}"`,
		`state="${task.state}"`,
		`turns="${task.turns}"`,
		`duration="${durationS}s"`,
	].join(" ");
	const inner: string[] = [];
	if (task.result?.trim()) {
		inner.push(`<result>\n${task.result.trim()}\n\t\t</result>`);
	}
	if (task.error) {
		inner.push(`<error>${escapeAttr(task.error)}</error>`);
	}
	if (inner.length === 0) return `\t<task ${attrs}/>`;
	return `\t<task ${attrs}>\n\t\t${inner.join("\n\t\t")}\n\t</task>`;
}

/**
 * 从 toolResult 文本解析回批次状态（历史重建用）。
 * 非委派 XML 或格式非法时返回 null。
 */
export function parseDelegationXml(text: string): DelegationBatchState | null {
	if (!text.includes("<delegation")) return null;
	const taskPattern =
		/<task\s+([^>]*?)\/>|<task\s+([^>]*?)>([\s\S]*?)<\/task>/g;
	const tasks: DelegationTaskState[] = [];
	let match: RegExpExecArray | null;
	while ((match = taskPattern.exec(text)) !== null) {
		const attrs = match[1] ?? match[2] ?? "";
		const body = match[3] ?? "";
		const task = parseTaskXml(attrs, body);
		if (!task) return null;
		tasks.push(task);
	}
	if (tasks.length === 0) return null;
	return { phase: "done", tasks };
}

function parseTaskXml(
	attrs: string,
	body: string,
): DelegationTaskState | null {
	const id = readAttr(attrs, "id");
	const kind = readAttr(attrs, "kind");
	const title = readAttr(attrs, "title");
	const state = readAttr(attrs, "state");
	const turns = readAttr(attrs, "turns");
	const duration = readAttr(attrs, "duration");
	if (
		!id ||
		!kind ||
		!title ||
		!state ||
		(kind !== "exploring" && kind !== "writing")
	) {
		return null;
	}
	if (!SUBAGENT_STATES.includes(state as SubagentState)) return null;
	const durationMs = duration ? Number.parseFloat(duration) * 1000 : 0;
	const resultMatch = body.match(/<result>([\s\S]*?)<\/result>/);
	const errorMatch = body.match(/<error>([\s\S]*?)<\/error>/);
	return {
		id,
		kind: kind as TaskKind,
		title: unescapeAttr(title),
		state: state as SubagentState,
		startedAt: 0,
		completedAt: Number.isFinite(durationMs) ? Math.round(durationMs) : 0,
		turns: turns ? Number.parseInt(turns, 10) || 0 : 0,
		...(resultMatch ? { result: unwrap(resultMatch[1]) } : {}),
		...(errorMatch ? { error: unescapeAttr(unwrap(errorMatch[1])) } : {}),
	};
}

function readAttr(attrs: string, name: string): string | undefined {
	const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
	return match?.[1];
}

function unwrap(text: string): string {
	return text.replace(/^\n/, "").replace(/\n[ \t]*$/, "").trim();
}

function escapeAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function unescapeAttr(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&gt;/g, ">")
		.replace(/&lt;/g, "<")
		.replace(/&amp;/g, "&");
}
