import { useState, useRef, useCallback, useEffect } from "react";
import type { EventBus } from "@vivlos/infra/eventbus/index.ts";

export interface Notification {
	message: string;
	color?: string;
}

// #region 日志级别 -> StatusBar 显示样式映射

const LOG_STYLE: Record<
	"info" | "warn" | "error",
	{ color: string; duration: number }
> = {
	info: { color: "#a6e3a1", duration: 3000 },
	warn: { color: "#f9e2af", duration: 4000 },
	error: { color: "#f38ba8", duration: 5000 },
};

// #endregion

/**
 * 通知 hook -- 统一管理 StatusBar 的瞬时通知。
 *
 * 两种来源写入同一 notification state（新的覆盖旧的）：
 *   1. 手动：notify(msg, color?, duration?)
 *   2. 自动：监听 EventBus "log" 事件，onTui===true 时按 LOG_STYLE 映射显示
 *
 * 默认自动清除，新通知覆盖旧通知。
 */
export function useNotification(eventBus: EventBus) {
	const [notification, setNotification] = useState<Notification | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const show = useCallback(
		(message: string, color?: string, duration = 3000) => {
			if (timerRef.current) clearTimeout(timerRef.current);
			setNotification({ message, color });
			timerRef.current = setTimeout(() => setNotification(null), duration);
		},
		[],
	);

	const notify = useCallback(
		(message: string, color?: string, duration = 3000) => {
			show(message, color, duration);
		},
		[show],
	);

	// 监听 EventBus log 事件，onTui===true 时自动显示
	useEffect(() => {
		const unsub = eventBus.on("log", (e) => {
			if (e.onTui !== true) return;
			const style = LOG_STYLE[e.level];
			show(e.message, style.color, style.duration);
		});
		return unsub;
	}, [eventBus, show]);

	return { notification, notify };
}
