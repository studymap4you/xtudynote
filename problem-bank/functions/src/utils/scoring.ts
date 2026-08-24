import type { Problem, ProblemSearchQuery, SearchScoreBreakdown } from "../models/problem.js";

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (!leftNorm || !rightNorm) return 0;
  return clamp(dot / Math.sqrt(leftNorm * rightNorm), -1, 1);
}

function tagOverlap(left: string[] = [], right: string[] = []): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return left.filter((tag) => rightSet.has(tag)).length / new Set([...left, ...right]).size;
}

function usedRecently(problem: Problem, now: Date): number {
  if (!problem.lastUsedAt) return 0;
  const date = problem.lastUsedAt instanceof Date ? problem.lastUsedAt : problem.lastUsedAt.toDate();
  const elapsedDays = Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
  return elapsedDays < 1 ? 1 : elapsedDays < 7 ? 0.6 : elapsedDays < 30 ? 0.25 : 0;
}

export function scoreProblem(
  problem: Problem,
  query: ProblemSearchQuery,
  semanticSimilarity: number,
  now = new Date(),
): { score: number; breakdown: SearchScoreBreakdown } {
  const breakdown: SearchScoreBreakdown = {
    semantic: clamp((semanticSimilarity + 1) / 2),
    typeMatch: problem.questionType === query.questionType ? 1 : 0,
    difficultyMatch: clamp(1 - Math.abs(problem.difficulty - query.difficulty) / 4),
    conceptMatch: Math.max(
      tagOverlap(problem.conceptTags, query.conceptTags),
      tagOverlap(problem.skillTags, query.skillTags),
    ),
    quality: clamp(problem.qualityScore / 100),
    usageDiversity: 1 / (1 + Math.log2(problem.usageCount + 1)),
    recentUsePenalty: usedRecently(problem, now),
  };
  const score =
    breakdown.semantic * 0.48
    + breakdown.typeMatch * 0.15
    + breakdown.difficultyMatch * 0.12
    + breakdown.conceptMatch * 0.08
    + breakdown.quality * 0.12
    + breakdown.usageDiversity * 0.05
    - breakdown.recentUsePenalty * 0.12;
  return { score: Number(score.toFixed(6)), breakdown };
}
