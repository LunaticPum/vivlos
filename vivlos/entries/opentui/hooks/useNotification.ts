import { useState, useRef, useCallback } from "react";

export interface Notification {
	message: string;
	color?: string;
}

/**
 * 通知 hook -- 统一管理 StatusBar 的瞬时通知。
 *
 * 生成者调 notify(msg, color?, duration?)，StatusBar 消费 notification。
 * 默认 3s 自动清除，新通知覆盖旧通知。
 */
export function useNotification() {
	const [notification, setNotification] = useState<Notification | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const notify = useCallback(
		(message: string, color?: string, duration = 3000) => {
			if (timerRef.current) clearTimeout(timerRef.current);
			setNotification({ message, color });
			timerRef.current = setTimeout(() => setNotification(null), duration);
		},
		[],
	);

	return { notification, notify };
}
