/**
 * spinner-control.tsx
 *
 * 演示：用 useKeyboard + useState 控制 spinner 的 start/stop + 切换样式
 *
 *   Space      → 启动 / 暂停
 *   ← / →      → 切换 spinner 名称
 *   ↑ / ↓      → 加速 / 减速
 *   Esc / q    → 退出
 *
 * 运行: bun run vivlos/entries/opentui/examples/spinner-control.tsx
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useState } from "react";
import "opentui-spinner/react";

const SPINNERS = ["dots", "line", "bouncingBall", "weather", "moon", "aesthetic", "arc", "star"];

function App() {
	const [nameIdx, setNameIdx] = useState(0);
	const [interval, setInterval] = useState(80);
	const [running, setRunning] = useState(true);

	useKeyboard((key) => {
		switch (key.name) {
			case "space":
				setRunning((v) => !v);
				break;
			case "right":
			case "l":
				setNameIdx((v) => (v + 1) % SPINNERS.length);
				break;
			case "left":
			case "h":
				setNameIdx((v) => (v - 1 + SPINNERS.length) % SPINNERS.length);
				break;
			case "up":
			case "k":
				setInterval((v) => Math.max(20, v - 20));
				break;
			case "down":
			case "j":
				setInterval((v) => Math.min(500, v + 20));
				break;
		}
	});

	return (
		<box flexDirection="column" padding={1}>
			<box flexDirection="row" height={1}>
				<spinner name={SPINNERS[nameIdx]} interval={interval} autoplay={running} color="#22d3ee" />
				<text marginLeft={1} fg={running ? "#22d3ee" : "#64748b"}>
					{SPINNERS[nameIdx]}
				</text>
			</box>

			<text fg="#64748b" height={1}>
				{running ? "▶ Running" : "⏸ Paused"} · interval={interval}ms
			</text>

			<text fg="#94a3b8">
				Space pause/resume · ←/→ switch spinner · ↑/↓ adjust speed · Esc/q quit
			</text>
		</box>
	);
}

const renderer = await createCliRenderer({ exitOnCtrlC: true });
createRoot(renderer).render(<App />);
