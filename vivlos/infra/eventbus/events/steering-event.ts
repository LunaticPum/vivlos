/**
 * Steering（运行中插话）队列的消费/丢弃事件。
 *
 * 由 SteeringQueue 在 drain（注入）/ clear（run 结束兜底丢弃）时发出，
 * TUI 据此把 QUEUED 卡片翻转为正常态 / 未发送态。
 */

/** 排队消息被注入 loop（steering 或 followUp 排空）。 */
export interface SteeringConsumedEvent {
	readonly type: "steering:consumed";
	readonly sessionId: string;
	/** 被消费的排队消息 id 列表。 */
	readonly ids: readonly string[];
}

/** 排队消息因 run 结束（中止/报错）未被注入而被丢弃。 */
export interface SteeringDroppedEvent {
	readonly type: "steering:dropped";
	readonly sessionId: string;
	/** 被丢弃的排队消息 id 列表。 */
	readonly ids: readonly string[];
}

export type SteeringEvent = SteeringConsumedEvent | SteeringDroppedEvent;
