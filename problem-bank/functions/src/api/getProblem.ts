import type { ProblemRepository } from "../services/problemRepository.js";
import { ApiError, requiredString } from "./errors.js";
import { problemResponse } from "./problemResponse.js";

export async function getProblem(questionId: string, repository: ProblemRepository) {
  const normalizedId = requiredString(questionId, "questionId", 100);
  const problem = await repository.getByQuestionId(normalizedId);
  if (!problem) throw new ApiError(404, "problem_not_found", "Problem not found.");
  return { problem: problemResponse(problem) };
}
