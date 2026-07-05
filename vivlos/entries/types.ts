/** 所有消息渠道的统一入口消息格式 */
export interface ChannelMessage {
	/** 消息来源渠道标识 */
	readonly channel: "tui" | "weixin";
	/** 发送者 ID（TUI 里不需要，但统一格式） */
	readonly senderId: string;
	/** 消息文本 */
	readonly text: string;
	/** 时间戳 */
	readonly timestamp: number;
}

/**
 * ChannelAdapter —— 所有消息渠道的统一接口。
 *
 * entries 层实现这个接口，把渠道消息转成 agent.prompt() 的输入。
 * 反方向：agent 事件通过 EventBus 到达，adapter 负责渲染到对应渠道。
 */
export interface ChannelAdapter {
	/** 渠道标识 */
	readonly channel: string;
	/** 启动渠道，开始接收消息 */
	start(): void;
	/** 停止渠道 */
	stop(): void;
}
