import type { Message } from "@earendil-works/pi-ai";
import type { SessionMeta } from "@vivlos/infra/storage/session/index.ts";

/**
 * Session 业务接口（agent 层定义）。
 *
 * 封装消息存储、增删查管 + 多 session 管理。
 * 内部委托 infra 层的 JSONL repo 做文件 I/O。
 */
export interface SessionManager {
	readonly id: string;
	/** 当前 session 的名称（null 表示未命名） */
	readonly name: string | null;
	/** true 表示只有稳定 ID/路径，尚未创建 Session 文件。 */
	readonly pending: boolean;
	readonly filePath: string;
	/** session 目录路径（filePath 的父目录，todo tool 等按 session 写文件用） */
	readonly dirPath: string;
	/** 按 sessionId 查找稳定目录；当前 pending session 也可解析。 */
	resolveDir(sessionId: string): string | undefined;

	// ── 当前 session 消息 ──
	getMessages(): readonly Message[];
	/** 幂等激活当前 pending Session；仅首次状态转换返回 true。 */
	activate(): boolean;
	appendMessage(message: Message): void;
	/** 替换全部消息（压缩后用，仅内存，不重写 JSONL） */
	replaceMessages(messages: Message[]): void;

	// ── 多 session 管理 ──
	/** 列出所有 session */
	listSessions(): SessionMeta[];
	/** 切换到另一个 session */
	switchTo(sessionId: string): void;
	/** 创建新 session 并切换 */
	createNew(name?: string): void;
	/** 删除 session */
	deleteSession(sessionId: string): boolean;
	/** 重命名当前 session */
	rename(name: string): void;
	/** 自动标题专用：只在目标 session 尚未命名时写入。 */
	renameIfUnnamed(sessionId: string, name: string): boolean;
}
