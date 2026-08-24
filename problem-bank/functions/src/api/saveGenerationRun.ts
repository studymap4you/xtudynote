import type { GenerationRun } from "../models/generationRun.js";
import type { ProblemRepository } from "../services/problemRepository.js";
import { normalizeTags } from "../utils/normalization.js";
import { boundedInteger, requireObject, requiredString } from "./errors.js";

export async function saveGenerationRun(body: unknown, repository: ProblemRepository) {
  const input = requireObject(body);
  const requestedQuestionCount = boundedInteger(
    input.requestedQuestionCount,
    "requestedQuestionCount",
    1,
    1_000,
  );
  const reusedQuestionCount = boundedInteger(
    input.reusedQuestionCount ?? 0,
    "reusedQuestionCount",
    0,
    requestedQuestionCount,
  );
  const generatedQuestionCount = boundedInteger(
    input.generatedQuestionCount ?? 0,
    "generatedQuestionCount",
    0,
    1_000,
  );
  const now = new Date();
  const run: GenerationRun = {
    generationRunId: requiredString(input.generationRunId, "generationRunId", 100),
    userRequest: requiredString(input.userRequest, "userRequest", 8_000),
    requestedQuestionCount,
    reusedQuestionCount,
    generatedQuestionCount,
    rejectedQuestionCount: boundedInteger(
      input.rejectedQuestionCount ?? 0,
      "rejectedQuestionCount",
      0,
      10_000,
    ),
    savedQuestionCount: boundedInteger(input.savedQuestionCount ?? 0, "savedQuestionCount", 0, 10_000),
    modelsUsed: normalizeTags(input.modelsUsed, 20),
    durationMs: boundedInteger(input.durationMs ?? 0, "durationMs", 0, 86_400_000),
    reuseRate: Number((reusedQuestionCount / requestedQuestionCount).toFixed(6)),
    createdAt: now,
    updatedAt: now,
  };
  await repository.saveGenerationRun(run);
  return {
    generationRunId: run.generationRunId,
    requestedQuestionCount: run.requestedQuestionCount,
    reusedQuestionCount: run.reusedQuestionCount,
    generatedQuestionCount: run.generatedQuestionCount,
    rejectedQuestionCount: run.rejectedQuestionCount,
    savedQuestionCount: run.savedQuestionCount,
    durationMs: run.durationMs,
    reuseRate: run.reuseRate,
  };
}
