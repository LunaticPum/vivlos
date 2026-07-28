/** EventBus 各领域事件的总联合。 */

import type { MainAgentEvent } from "./events/main-agent-event.ts";
import type { MemoryEvent } from "./events/memory-event.ts";
import type { SessionEvent } from "./events/session-event.ts";
import type { AppEvent } from "./events/app-event.ts";
import type { WorkspaceEvent } from "./events/workspace-event.ts";

export type VivlosEvent =
	| MainAgentEvent
	| MemoryEvent
	| SessionEvent
	| AppEvent
	| WorkspaceEvent;

export type { MainAgentEvent } from "./events/main-agent-event.ts";
export type {
	MemoryEvent,
	MemoryOperationEvent,
	MemoryChangedEvent,
} from "./events/memory-event.ts";
export type { SessionEvent } from "./events/session-event.ts";
export type { AppEvent } from "./events/app-event.ts";
export type {
	WorkspaceEvent,
	TodoItem,
	TaskItem,
} from "./events/workspace-event.ts";
