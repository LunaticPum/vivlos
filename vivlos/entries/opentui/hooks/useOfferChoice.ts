import { useCallback, useEffect, useState } from "react";
import type {
	EventBus,
	OfferChoiceAnswer,
	OfferChoiceQuestion,
} from "@vivlos/infra/eventbus/index.ts";

/** 当前 OpenTUI 正在处理的瞬时 Offer Choice 请求。 */
export interface PendingOfferChoice {
	readonly sessionId: string;
	readonly toolCallId: string;
	readonly questions: readonly OfferChoiceQuestion[];
}

export interface UseOfferChoiceResult {
	readonly pending: PendingOfferChoice | null;
	readonly resolve: (answers: readonly OfferChoiceAnswer[]) => void;
}

/** 将 Offer Choice EventBus 事件桥接为 Workspace 可消费的 React 状态。 */
export function useOfferChoice(
	eventBus: EventBus,
	currentSessionId: string,
): UseOfferChoiceResult {
	const [pending, setPending] = useState<PendingOfferChoice | null>(null);

	useEffect(() => {
		const offPending = eventBus.on("offer_choice:pending", (event) => {
			if (event.sessionId !== currentSessionId) return;
			setPending({
				sessionId: event.sessionId,
				toolCallId: event.toolCallId,
				questions: event.questions,
			});
		});
		const offToolEnd = eventBus.on("agent:toolCall_end", (event) => {
			setPending((current) =>
				current?.sessionId === event.sessionId && current.toolCallId === event.callId
					? null
					: current,
			);
		});
		const offAgentError = eventBus.on("agent:error", (event) => {
			setPending((current) =>
				current?.sessionId === event.sessionId ? null : current,
			);
		});

		return () => {
			offPending();
			offToolEnd();
			offAgentError();
		};
	}, [currentSessionId, eventBus]);

	const resolve = useCallback((answers: readonly OfferChoiceAnswer[]) => {
		if (!pending) return;
		eventBus.emit({
			type: "offer_choice:resolved",
			sessionId: pending.sessionId,
			toolCallId: pending.toolCallId,
			answers,
		});
		setPending(null);
	}, [eventBus, pending]);

	return { pending, resolve };
}
