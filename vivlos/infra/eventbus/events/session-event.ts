/** Session 元数据事件。 */

export type SessionEvent = {
	readonly type: "session:renamed";
	readonly sessionId: string;
	readonly name: string;
	readonly source: "auto" | "user";
};
