import type {
  CSATEmphasisRange,
  CSATNormalizationIssue,
  NormalizedCSATQuestion,
  RenderableGeneratedCsatQuestion,
} from "@/lib/renderEngine/types";

export type NormalizedQuestionResult = {
  questions: NormalizedCSATQuestion[];
  issues: CSATNormalizationIssue[];
};

function requiredText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmphasisRanges(value: unknown): CSATEmphasisRange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((range) => {
    if (!range || typeof range !== "object") return [];
    const target = (range as { target?: unknown }).target;
    const style = (range as { style?: unknown }).style;
    const start = Number((range as { start?: unknown }).start);
    const end = Number((range as { end?: unknown }).end);
    const choiceIndexValue = (range as { choiceIndex?: unknown }).choiceIndex;
    const choiceIndex = choiceIndexValue === undefined ? undefined : Number(choiceIndexValue);
    const source = requiredText((range as { source?: unknown }).source) || undefined;
    if (!["passage", "stem", "choice"].includes(String(target))) return [];
    if (!["bold", "underline"].includes(String(style))) return [];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return [];
    if (target === "choice" && (!Number.isInteger(choiceIndex) || Number(choiceIndex) < 1 || Number(choiceIndex) > 5)) return [];
    return [{
      target: target as CSATEmphasisRange["target"],
      style: style as CSATEmphasisRange["style"],
      start,
      end,
      choiceIndex,
      source,
    }];
  });
}

export function normalizeCSATQuestions(questions: RenderableGeneratedCsatQuestion[]): NormalizedQuestionResult {
  const normalized: NormalizedCSATQuestion[] = [];
  const issues: CSATNormalizationIssue[] = [];

  questions.forEach((question, inputIndex) => {
    const questionId = requiredText(question?.id) || `input-${inputIndex + 1}`;
    const passage = requiredText(question?.passage);
    const stem = requiredText(question?.stem);
    const questionType = requiredText(question?.questionType);
    const choices = Array.isArray(question?.choices) ? question.choices : [];
    const choiceIndexes = choices.map((choice) => Number(choice?.index));
    const choicesAreValid = choices.length === 5
      && choiceIndexes.every((index) => Number.isInteger(index) && index >= 1 && index <= 5)
      && new Set(choiceIndexes).size === 5
      && choices.every((choice) => requiredText(choice?.text));

    const missing: string[] = [];
    if (!passage) missing.push("passage");
    if (!stem) missing.push("stem");
    if (!questionType) missing.push("questionType");
    if (!choicesAreValid) missing.push("five-valid-choices");
    if (missing.length > 0) {
      issues.push({ questionId, inputIndex, message: `렌더링 필수 데이터 누락: ${missing.join(", ")}` });
      return;
    }

    normalized.push({
      id: questionId,
      studentNumber: normalized.length + 1,
      questionType,
      difficulty: question.difficulty,
      scoreSuggestion: question.scoreSuggestion,
      passage,
      stem,
      choices: choices.map((choice) => ({
        index: choice.index,
        text: choice.text.trim(),
        isCorrect: choice.isCorrect,
        distractorPattern: requiredText(choice.distractorPattern) || undefined,
        rationale: requiredText(choice.rationale),
      })),
      answer: question.answer,
      explanation: requiredText(question.explanation),
      sourceId: requiredText(question.sourceId),
      referenceQuestionIds: Array.isArray(question.referenceQuestionIds)
        ? question.referenceQuestionIds.map(requiredText).filter(Boolean)
        : [],
      evidence: question.evidence,
      qualityMetadata: question.qualityMetadata,
      emphasisRanges: normalizeEmphasisRanges(question.emphasisRanges),
      groupId: requiredText(question.groupId) || undefined,
      sharedPassage: requiredText(question.sharedPassage) || undefined,
    });
  });

  return { questions: normalized, issues };
}
