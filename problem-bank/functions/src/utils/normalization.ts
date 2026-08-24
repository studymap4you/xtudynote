import { createHash } from "node:crypto";
import type { NormalizedProblemDraft, ProblemDraft } from "../models/problem.js";
import { createPermanentId } from "./ids.js";

export function cleanText(value: unknown, maxLength = 20_000): string {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function optionalText(value: unknown, maxLength = 20_000): string | undefined {
  const normalized = cleanText(value, maxLength);
  return normalized || undefined;
}

export function normalizeTags(value: unknown, maxItems = 30): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 80).toLowerCase()).filter(Boolean))].slice(0, maxItems);
}

export function normalizeComparableText(value: unknown): string {
  return cleanText(value, 100_000)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normalizeProblemDraft(input: ProblemDraft): NormalizedProblemDraft {
  const choices = Array.isArray(input.choices)
    ? input.choices.map((choice) => cleanText(choice, 2_000)).filter(Boolean).slice(0, 8)
    : undefined;
  const rawAnswer = input.answer;
  const answer = typeof rawAnswer === "number"
    ? rawAnswer
    : cleanText(rawAnswer, 2_000);
  return {
    questionId: cleanText(input.questionId, 80) || createPermanentId("XUQ"),
    subject: cleanText(input.subject, 80).toLowerCase(),
    language: cleanText(input.language || "en", 20).toLowerCase(),
    examFamily: cleanText(input.examFamily, 80).toLowerCase(),
    grade: Number.isInteger(input.grade) ? input.grade : undefined,
    questionType: cleanText(input.questionType, 120).toLowerCase(),
    subtype: optionalText(input.subtype, 120)?.toLowerCase(),
    difficulty: Number(input.difficulty),
    sourceId: optionalText(input.sourceId, 100),
    passage: optionalText(input.passage, 30_000),
    question: cleanText(input.question, 4_000),
    choices,
    answer,
    explanation: optionalText(input.explanation, 12_000),
    conceptTags: normalizeTags(input.conceptTags),
    skillTags: normalizeTags(input.skillTags),
    generator: input.generator
      ? {
          provider: optionalText(input.generator.provider, 100),
          model: optionalText(input.generator.model, 160),
          version: optionalText(input.generator.version, 100),
        }
      : undefined,
  };
}

export function problemFingerprint(problem: Pick<NormalizedProblemDraft, "passage" | "question" | "choices">): string {
  const comparable = [problem.passage, problem.question, ...(problem.choices || [])]
    .map(normalizeComparableText)
    .join("\n");
  return createHash("sha256").update(comparable).digest("hex");
}
