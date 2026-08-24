import type { NormalizedProblemDraft, ProblemValidation } from "../models/problem.js";

export interface ValidationOutcome {
  approved: boolean;
  validation: ProblemValidation;
  qualityScore: number;
}

function englishWordCount(value: string | undefined): number {
  return (value?.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || []).length;
}

export class ValidationService {
  validate(problem: NormalizedProblemDraft): ValidationOutcome {
    const issues: string[] = [];
    const choices = problem.choices || [];
    const answerPresent =
      typeof problem.answer === "number"
        ? Number.isInteger(problem.answer) && problem.answer >= 1 && problem.answer <= choices.length
        : problem.answer.trim().length > 0;
    if (!answerPresent) issues.push("answer_missing_or_invalid");

    const explanationPresent = (problem.explanation?.length || 0) >= 20;
    if (!explanationPresent) issues.push("explanation_missing_or_too_short");

    if (!problem.subject) issues.push("subject_missing");
    if (!problem.examFamily) issues.push("exam_family_missing");
    if (!problem.questionType) issues.push("question_type_missing");
    if (problem.question.length < 5) issues.push("question_too_short");
    if (!Number.isInteger(problem.difficulty) || problem.difficulty < 1 || problem.difficulty > 5) {
      issues.push("difficulty_out_of_range");
    }
    if (choices.length > 0 && choices.length < 2) issues.push("choices_incomplete");
    if (problem.examFamily === "csat" && choices.length !== 5) issues.push("csat_requires_five_choices");
    if (new Set(choices.map((choice) => choice.toLowerCase())).size !== choices.length) {
      issues.push("duplicate_choices");
    }
    if (problem.passage && englishWordCount(problem.passage) < 35) issues.push("passage_too_short");

    const structuralIssues = issues.filter(
      (issue) => !["answer_missing_or_invalid", "explanation_missing_or_too_short"].includes(issue),
    );
    const structurallyValid = structuralIssues.length === 0;
    const qualityScore = Math.min(
      100,
      (structurallyValid ? 35 : 0)
        + (answerPresent ? 25 : 0)
        + (explanationPresent ? 25 : 0)
        + (problem.passage && englishWordCount(problem.passage) >= 80 ? 10 : 0)
        + (problem.conceptTags.length || problem.skillTags.length ? 5 : 0),
    );
    const validation: ProblemValidation = {
      answerPresent,
      explanationPresent,
      structurallyValid,
      issues,
    };
    return {
      approved: answerPresent && explanationPresent && structurallyValid,
      validation,
      qualityScore,
    };
  }
}
