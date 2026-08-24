import type { ProblemRepository } from "../services/problemRepository.js";
import { requireObject, requiredString } from "./errors.js";

export async function reportUsage(
  questionId: string,
  body: unknown,
  repository: ProblemRepository,
) {
  const input = requireObject(body);
  const normalizedQuestionId = requiredString(questionId, "questionId", 100);
  const workbookId = requiredString(input.workbookId, "workbookId", 160);
  const result = await repository.recordUsage(normalizedQuestionId, workbookId);
  return {
    questionId: normalizedQuestionId,
    workbookId,
    recorded: result.recorded,
    eventId: result.event?.eventId,
  };
}
