/**
 * 组装层 AgentLog
 *
 * 将 useAgent 返回的 logs 数组渲染为日志流：
 *  thinking → LogLine(kind="thinking")
 *  tool     → LogLine(kind="tool")
 *  turn_sep → VDivider
 */

import type { LogEntry } from "../hooks/useAgent";
import { LogLine } from "../ui/patterns/LogLine";
import { VDivider } from "../ui/primitives/VDivider";
import { VBox } from "../ui/primitives/VBox";

export function AgentLog({
	logs,
	spin,
}: {
	logs: LogEntry[];
	/** 当前 spinner 图标 */
	spin: string;
}) {
	return (
		<VBox flexDirection="column">
			{logs.map((entry, i) => {
				if (entry.kind === "turn_sep") {
					return <VDivider key={i} />;
				}

				if (entry.kind === "thinking") {
					return (
						<LogLine
							key={i}
							kind="thinking"
							icon={entry.active ? spin : "✓"}
							text={entry.text}
						/>
					);
				}

				// tool
				return (
					<LogLine
						key={i}
						kind="tool"
						icon={entry.active ? spin : "✓"}
						toolName={entry.name}
						toolResult={entry.result}
					/>
				);
			})}
		</VBox>
	);
}
