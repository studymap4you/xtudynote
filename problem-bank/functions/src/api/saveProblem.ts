import type { ProblemDraft } from "../models/problem.js";
import type { ProblemSaveService } from "../services/problemSaveService.js";
import { requireObject } from "./errors.js";
import { problemResponse } from "./problemResponse.js";

export async function saveProblem(body: unknown, service: ProblemSaveService) {
  const input = requireObject(body) as unknown as ProblemDraft;
  const result = await service.save(input);
  return {
    transition: result.transition,
    status: result.problem.status,
    problem: problemResponse(result.problem),
  };
}
