import { useState, useRef, useCallback } from "react";

/**
 * 双击 Ctrl+C 退出 hook。
 *
 * loading 时第一次 Ctrl+C 打断，idle 时第一次显示提示、第二次退出。
 * 用 ref 跟踪状态避免 useKeyboard 闭包过期。
 */
export function useExitHandler(
	onExit: () => void,
	loading: boolean,
	abort: () => void,
) {
	const [exitPending, setExitPending] = useState(false);
	const pendingRef = useRef(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCtrlC = useCallback(() => {
		if (loading) {
			abort();
			return;
		}
		if (pendingRef.current) {
			if (timerRef.current) clearTimeout(timerRef.current);
			onExit();
			return;
		}
		pendingRef.current = true;
		setExitPending(true);
		timerRef.current = setTimeout(() => {
			pendingRef.current = false;
			setExitPending(false);
			timerRef.current = null;
		}, 3000);
	}, [loading, abort, onExit]);

	return { exitPending, handleCtrlC };
}
