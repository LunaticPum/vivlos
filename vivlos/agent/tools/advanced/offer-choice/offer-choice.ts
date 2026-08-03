/** `offer_choice` Tool：暂停 Agent，等待用户完成一组分页单选。 */

import { Type, type Static } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type {
	OfferChoiceAnswer,
	OfferChoiceQuestion,
} from "@vivlos/infra/eventbus/index.ts";
import { ToolError } from "@vivlos/shared/errors.ts";
import type { AdvancedToolDeps } from "../index.ts";
import { description } from "./description.ts";

const Choice = Type.Object(
	{
		label: Type.String({
			description: "Option label",
			minLength: 1,
			maxLength: 80,
		}),
		description: Type.String({
			description: "Required non-empty explanation of this option's meaning, impact, or difference from the other options. Use the user's language.",
			minLength: 1,
			maxLength: 160,
		}),
	},
	{ additionalProperties: false },
);

const Question = Type.Object(
	{
		title: Type.String({
			description: "Short pagination title",
			minLength: 1,
			maxLength: 12,
		}),
		question: Type.String({
			description: "Question shown to the user",
			minLength: 1,
			maxLength: 240,
		}),
		choices: Type.Array(Choice, {
			description: "Single-choice options",
			minItems: 2,
			maxItems: 6,
		}),
	},
	{ additionalProperties: false },
);

const Params = Type.Object(
	{
		questions: Type.Array(Question, {
			description: "Questions shown one page at a time",
			minItems: 1,
			maxItems: 4,
		}),
	},
	{ additionalProperties: false },
);

type Params = Static<typeof Params>;

export interface OfferChoiceDetails {
	readonly answers: readonly OfferChoiceAnswer[];
}

/** 创建仅供交互式 OpenTUI 使用的 Offer Choice Tool。 */
export function createOfferChoiceTool(
	deps: AdvancedToolDeps,
): AgentTool<typeof Params, OfferChoiceDetails> {
	return {
		name: "offer_choice",
		description,
		label: "用户选择",
		parameters: Params,
		executionMode: "sequential",
		async execute(
			toolCallId: string,
			params: Params,
			signal?: AbortSignal,
		): Promise<AgentToolResult<OfferChoiceDetails>> {
			const questions = normalizeQuestions(params.questions);
			const sessionId = deps.getSessionId();

			return new Promise((resolve, reject) => {
				let settled = false;
				let unsubscribe = () => {};

				const cleanup = () => {
					unsubscribe();
					signal?.removeEventListener("abort", handleAbort);
				};
				const finish = (settle: () => void) => {
					if (settled) return;
					settled = true;
					cleanup();
					settle();
				};
				const handleAbort = () => {
					finish(() => reject(new Error("Offer Choice aborted")));
				};

				unsubscribe = deps.eventBus.on("offer_choice:resolved", (event) => {
					if (event.sessionId !== sessionId || event.toolCallId !== toolCallId) return;

					try {
						const answers = validateAnswers(questions, event.answers);
						finish(() => resolve({
							content: [{ type: "text", text: formatAnswers(answers) }],
							details: { answers },
						}));
					} catch (error) {
						const cause = error instanceof Error ? error : new Error(String(error));
						finish(() => reject(cause));
					}
				});

				if (signal?.aborted) {
					handleAbort();
					return;
				}
				signal?.addEventListener("abort", handleAbort, { once: true });

				deps.eventBus.emit({
					type: "offer_choice:pending",
					sessionId,
					toolCallId,
					questions,
				});
			});
		},
	};
}

/** 规范化模型文本，并拒绝同一问题中的重复选项。 */
function normalizeQuestions(questions: Params["questions"]): readonly OfferChoiceQuestion[] {
	return questions.map((question, questionIndex) => {
		const title = requireText(question.title, `Question ${questionIndex + 1} title`);
		const prompt = requireText(question.question, `Question ${questionIndex + 1}`);
		const labels = new Set<string>();
		const choices = question.choices.map((choice, choiceIndex) => {
			const label = requireText(
				choice.label,
				`Question ${questionIndex + 1} choice ${choiceIndex + 1}`,
			);
			if (labels.has(label)) {
				throw new ToolError(
					`Question ${questionIndex + 1} contains duplicate choices`,
					"offer_choice",
				);
			}
			labels.add(label);
			const choiceDescription = requireText(
				choice.description,
				`Question ${questionIndex + 1} choice ${choiceIndex + 1} description`,
			);
			return {
				label,
				description: choiceDescription,
			};
		});
		return { title, question: prompt, choices };
	});
}

/** 校验 UI 回传，EventBus 不能绕过 Tool 的最终答案约束。 */
function validateAnswers(
	questions: readonly OfferChoiceQuestion[],
	answers: readonly OfferChoiceAnswer[],
): readonly OfferChoiceAnswer[] {
	if (answers.length !== questions.length) {
		throw new ToolError("Offer Choice returned an incomplete answer set", "offer_choice");
	}

	return answers.map((answer, index) => {
		const question = questions[index]!;
		if (answer.question !== question.question) {
			throw new ToolError(
				"Offer Choice answers do not match the question order",
				"offer_choice",
			);
		}
		const text = requireText(answer.answer, `Answer ${index + 1}`);
		if (
			answer.source === "choice" &&
			!question.choices.some((choice) => choice.label === text)
		) {
			throw new ToolError(
				`Answer ${index + 1} is not one of the offered choices`,
				"offer_choice",
			);
		}
		if (answer.source !== "choice" && answer.source !== "custom") {
			throw new ToolError(`Answer ${index + 1} has an invalid source`, "offer_choice");
		}
		return { question: question.question, answer: text, source: answer.source };
	});
}

function requireText(value: string, field: string): string {
	const text = value.trim();
	if (!text) throw new ToolError(`${field} cannot be empty`, "offer_choice");
	return text;
}

function formatAnswers(answers: readonly OfferChoiceAnswer[]): string {
	return [
		"用户已完成选择：",
		...answers.map(
			(answer, index) =>
				`${index + 1}. ${answer.question}\n回答：${answer.answer}`,
		),
	].join("\n");
}
