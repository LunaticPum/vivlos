import { useEffect, useRef, useState } from "react";
import type {
	BorderCharacters,
	ContentChangeEvent,
	TextareaRenderable,
} from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type {
	OfferChoiceAnswer,
	OfferChoiceQuestion,
} from "@vivlos/infra/eventbus/index.ts";

const C = {
	border: "#cba6f7",
	text: "#cdd6f4",
	muted: "#a6adc8",
	accent: "#89dceb",
	selected: "#cba6f7",
} as const;

const selectBorder: BorderCharacters = {
	topLeft: "─",
	topRight: "─",
	bottomLeft: "─",
	bottomRight: "─",
	horizontal: "─",
	vertical: " ",
	topT: "─",
	bottomT: "─",
	leftT: "─",
	rightT: "─",
	cross: "─",
};

const EXIT_CONFIRM_MS = 3000;
const OTHER_LABEL = "其他";
const OTHER_DESCRIPTION = "输入未列出的意见或补充说明";

export interface OfferChoiceControlsProps {
	readonly questions: readonly OfferChoiceQuestion[];
	readonly onResolve: (answers: readonly OfferChoiceAnswer[]) => void;
	readonly onAbort: () => void;
}

/** OpenCode 风格的底部分页单选控制区。 */
export function OfferChoiceControls({
	questions,
	onResolve,
	onAbort,
}: OfferChoiceControlsProps) {
	const [currentPage, setCurrentPage] = useState(0);
	const [cursors, setCursors] = useState<number[]>(() => questions.map(() => 0));
	const [answers, setAnswers] = useState<Array<OfferChoiceAnswer | undefined>>(
		() => questions.map(() => undefined),
	);
	const [customDrafts, setCustomDrafts] = useState<string[]>(() =>
		questions.map(() => ""),
	);
	const [customInputActive, setCustomInputActive] = useState(false);
	const [customLines, setCustomLines] = useState(1);
	const [exitConfirm, setExitConfirm] = useState(false);
	const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const textareaRef = useRef<TextareaRenderable>(null);

	const question = questions[currentPage]!;
	const otherIndex = question.choices.length;
	const cursor = cursors[currentPage] ?? 0;
	const selectHeight =
		question.choices.length + 5 + (customInputActive ? customLines : 0);

	const cancelExitConfirm = () => {
		setExitConfirm(false);
		if (exitTimerRef.current) {
			clearTimeout(exitTimerRef.current);
			exitTimerRef.current = null;
		}
	};

	const armExitConfirm = () => {
		setExitConfirm(true);
		if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
		exitTimerRef.current = setTimeout(() => {
			setExitConfirm(false);
			exitTimerRef.current = null;
		}, EXIT_CONFIRM_MS);
	};
	const syncCustomLines = () => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		setCustomLines(
			Math.min(Math.max(textarea.editorView.getTotalVirtualLineCount(), 1), 2),
		);
	};

	useEffect(
		() => () => {
			if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
		},
		[],
	);
	useEffect(() => {
		if (customInputActive) syncCustomLines();
	}, [currentPage, customInputActive]);

	const updateCursor = (next: number) => {
		setCursors((current) => current.map((value, index) =>
			index === currentPage ? next : value));
	};

	const commitAnswer = (answer: OfferChoiceAnswer) => {
		const nextAnswers = answers.map((value, index) =>
			index === currentPage ? answer : value);
		setAnswers(nextAnswers);
		setCustomInputActive(false);
		setCustomLines(1);
		cancelExitConfirm();

		if (currentPage === questions.length - 1) {
			const completedAnswers = nextAnswers.filter(
				(value): value is OfferChoiceAnswer => value !== undefined,
			);
			if (completedAnswers.length !== questions.length) return;
			onResolve(completedAnswers);
			return;
		}
		setCurrentPage((page) => page + 1);
	};

	const submitCustom = () => {
		const text =
			textareaRef.current?.plainText.trim() ?? customDrafts[currentPage]!.trim();
		if (!text) return;
		setCustomDrafts((current) => current.map((value, index) =>
			index === currentPage ? text : value));
		commitAnswer({ question: question.question, answer: text, source: "custom" });
	};

	const handleContentChange = (_event: ContentChangeEvent) => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		const text = textarea.plainText;
		setCustomDrafts((current) => current.map((value, index) =>
			index === currentPage ? text : value));
		syncCustomLines();
	};

	useKeyboard((key) => {
		if (
			key.repeated &&
			(key.name === "return" || key.name === "kpenter" || key.name === "escape")
		) return;

		if (key.ctrl && key.name === "c") {
			key.preventDefault();
			onAbort();
			return;
		}

		if (customInputActive) {
			if (key.name === "escape") {
				key.preventDefault();
				setCustomInputActive(false);
				setCustomLines(1);
				cancelExitConfirm();
			}
			return;
		}

		if (key.name === "up" || key.name === "down") {
			key.preventDefault();
			cancelExitConfirm();
			const delta = key.name === "up" ? -1 : 1;
			updateCursor(Math.min(Math.max(cursor + delta, 0), otherIndex));
			return;
		}

		if (key.name === "return" || key.name === "kpenter") {
			key.preventDefault();
			cancelExitConfirm();
			if (cursor === otherIndex) {
				setCustomInputActive(true);
				return;
			}
			const choice = question.choices[cursor];
			if (!choice) return;
			commitAnswer({
				question: question.question,
				answer: choice.label,
				source: "choice",
			});
			return;
		}

		if (key.name === "escape") {
			key.preventDefault();
			if (currentPage > 0) {
				cancelExitConfirm();
				setCurrentPage((page) => page - 1);
				return;
			}
			if (exitConfirm) {
				cancelExitConfirm();
				onAbort();
			} else {
				armExitConfirm();
			}
		}
	});

	return (
		<>
			<box
				height={selectHeight}
				width="100%"
				border={["top", "bottom"]}
				customBorderChars={selectBorder}
				borderColor={C.border}
				title={exitConfirm
					? " 再次按 Esc 取消选择并返回输入框 "
					: ` 问题 ${currentPage + 1}/${questions.length}: ${question.title} `}
				titleAlignment="left"
				flexDirection="column"
				paddingX={1}
				overflow="hidden"
			>
				<box height={2} width="100%" overflow="hidden">
					<text fg={C.text}>{question.question}</text>
				</box>
				{question.choices.map((choice, index) => (
					<box
						key={`${index}-${choice.label}`}
						height={1}
						width="100%"
						flexDirection="row"
						overflow="hidden"
					>
						<text fg={cursor === index ? C.selected : C.text}>
							{cursor === index ? "❯ " : "  "}{index + 1}. {choice.label}
						</text>
						<text fg={C.muted}>  {choice.description}</text>
					</box>
				))}
				<box height={1} width="100%" flexDirection="row">
					<text fg={cursor === otherIndex ? C.selected : C.text}>
						{cursor === otherIndex ? "❯ " : "  "}{otherIndex + 1}. {OTHER_LABEL}
					</text>
					<text fg={C.muted}>  {OTHER_DESCRIPTION}</text>
				</box>
				{customInputActive && (
					<box height={customLines} width="100%" paddingLeft={2}>
						<textarea
							ref={textareaRef}
							focused={true}
							showCursor={true}
							initialValue={customDrafts[currentPage]}
							placeholder="输入你的意见"
							placeholderColor={C.muted}
							textColor={C.text}
							wrapMode="char"
							keyBindings={[
								{ name: "return", action: "submit" },
								{ name: "kpenter", action: "submit" },
							]}
							onContentChange={handleContentChange}
							onSizeChange={syncCustomLines}
							onSubmit={submitCustom}
						/>
					</box>
				)}
			</box>

			<box height={1} width="100%" flexDirection="row" overflow="hidden">
				<text fg={C.accent}>
					{customInputActive
						? "Enter 提交  Esc 收起  Ctrl+C 中止"
						: "↑↓ 选择  Enter 确认  Esc 返回  Ctrl+C 中止"}
				</text>
			</box>
		</>
	);
}
