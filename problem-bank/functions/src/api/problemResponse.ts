import type { Problem, ProblemSearchResult } from "../models/problem.js";

export function problemResponse(problem: Problem): Omit<Problem, "embedding" | "contentFingerprint"> {
  const { embedding: _embedding, contentFingerprint: _contentFingerprint, ...response } = problem;
  return response;
}

export function searchResultResponse(result: ProblemSearchResult) {
  return {
    problem: problemResponse(result.problem),
    score: result.score,
    semanticSimilarity: Number(result.semanticSimilarity.toFixed(6)),
    breakdown: result.breakdown,
  };
}
