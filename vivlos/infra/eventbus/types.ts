/** EventBus 各领域事件的总联合。 */

import type { MainAgentEvent } from "./events/main-agent-event.ts";
import type { ConsolidateEvent } from "./events/consolidate-event.ts";
import type { MemoryEvent } from "./events/memory-event.ts";
import type { SessionEvent } from "./events/session-event.ts";
import type { AppEvent } from "./events/app-event.ts";
import type { WorkspaceEvent } from "./events/workspace-event.ts";
import type { DelegationEvent } from "./events/delegation-event.ts";
import type { SteeringEvent } from "./events/steering-event.ts";

export type VivlosEvent =
	| MainAgentEvent
	| ConsolidateEvent
	| MemoryEvent
	| SessionEvent
	| AppEvent
	| WorkspaceEvent
	| DelegationEvent
	| SteeringEvent;

export type { MainAgentEvent } from "./events/main-agent-event.ts";
export type {
	ConsolidateEvent,
	ConsolidateReason,
	ConsolidateStatus,
	ConsolidateError,
} from "./events/consolidate-event.ts";
export type {
	MemoryEvent,
	MemoryOperationEvent,
	MemoryChangedEvent,
	MemoryOverviewRequestedEvent,
	MemoryOverviewEvent,
} from "./events/memory-event.ts";
export type {
	SessionEvent,
	SessionStateSnapshot,
} from "./events/session-event.ts";
export type { AppEvent } from "./events/app-event.ts";
export type {
	DelegationEvent,
	DelegationTaskMessagesEvent,
} from "./events/delegation-event.ts";
export type {
	SteeringEvent,
	SteeringConsumedEvent,
	SteeringDroppedEvent,
} from "./events/steering-event.ts";
export type {
	WorkspaceEvent,
	TodoPriority,
	TodoItemStatus,
	TodoListStatus,
	TodoItem,
	TodoList,
	OfferChoiceOption,
	OfferChoiceQuestion,
	OfferChoiceAnswer,
} from "./events/workspace-event.ts";
