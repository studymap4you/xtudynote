import type {
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
      groupId: requiredText(question.groupId) || undefined,
      sharedPassage: requiredText(question.sharedPassage) || undefined,
    });
  });

  return { questions: normalized, issues };
}
