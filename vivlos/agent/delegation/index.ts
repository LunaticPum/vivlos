/**
 * Subagent 委派模块。
 *
 * 管理者模式的最小落地：主模型经 delegate tool 把 1-2 个子任务
 * 派发给独立上下文的子 agent，同步等待并取回结构化摘要。
 */

export * from "./types.ts";
export * from "./tool-policy.ts";
export * from "./prompts.ts";
export * from "./xml.ts";
export * from "./runner.ts";
