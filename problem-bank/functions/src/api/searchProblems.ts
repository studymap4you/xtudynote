import type { ProblemSearchQuery } from "../models/problem.js";
import { normalizeTags } from "../utils/normalization.js";
import type { ProblemSearchProvider } from "../services/problemSearchService.js";
import { ApiError, boundedInteger, requireObject, requiredString } from "./errors.js";
import { searchResultResponse } from "./problemResponse.js";

function optionalInteger(value: unknown, field: string, minimum: number, maximum: number): number | undefined {
  if (value == null || value === "") return undefined;
  return boundedInteger(value, field, minimum, maximum);
}

function stringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? "").trim().slice(0, 120)).filter(Boolean))]
    .slice(0, maxItems);
}

export function parseProblemSearchQuery(body: unknown): ProblemSearchQuery {
  const input = requireObject(body);
  const count = boundedInteger(input.count, "count", 1, 100);
  const sourceText = requiredString(input.sourceText, "sourceText", 50_000);
  if (sourceText.length < 5) throw new ApiError(400, "invalid_request", "sourceText is too short.");
  return {
    subject: requiredString(input.subject, "subject", 80).toLowerCase(),
    language: input.language ? requiredString(input.language, "language", 20).toLowerCase() : undefined,
    examFamily: requiredString(input.examFamily, "examFamily", 80).toLowerCase(),
    grade: optionalInteger(input.grade, "grade", 1, 12),
    questionType: requiredString(input.questionType, "questionType", 120).toLowerCase(),
    subtype: input.subtype ? requiredString(input.subtype, "subtype", 120).toLowerCase() : undefined,
    difficulty: boundedInteger(input.difficulty, "difficulty", 1, 5),
    count,
    sourceText,
    conceptTags: normalizeTags(input.conceptTags),
    skillTags: normalizeTags(input.skillTags),
    excludeQuestionIds: stringArray(input.excludeQuestionIds, 200),
    workbookId: input.workbookId ? requiredString(input.workbookId, "workbookId", 160) : undefined,
  };
}

export async function searchProblems(body: unknown, provider: ProblemSearchProvider) {
  const query = parseProblemSearchQuery(body);
  const result = await provider.searchSimilarProblems(query);
  return {
    requestedCount: result.requestedCount,
    foundCount: result.foundCount,
    missingCount: result.missingCount,
    searchMode: result.searchMode,
    problems: result.problems.map(searchResultResponse),
  };
}
