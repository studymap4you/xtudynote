import type { DuplicateCluster } from "../models/generationRun.js";
import type { Problem, ProblemDraft } from "../models/problem.js";
import { normalizeProblemDraft, problemFingerprint } from "../utils/normalization.js";
import { problemEmbeddingText, type EmbeddingProvider } from "./embeddingService.js";
import type { DuplicateService } from "./duplicateService.js";
import {
  DuplicateQuestionIdError,
  type ProblemRepository,
} from "./problemRepository.js";
import type { ValidationService } from "./validationService.js";

export interface SaveProblemResult {
  problem: Problem;
  transition: "raw_to_approved" | "raw_to_rejected" | "raw_to_duplicate";
}

export { DuplicateQuestionIdError };

export class ProblemSaveService {
  constructor(
    private readonly repository: ProblemRepository,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly validationService: ValidationService,
    private readonly duplicateService: DuplicateService,
  ) {}

  async save(draft: ProblemDraft): Promise<SaveProblemResult> {
    const normalized = normalizeProblemDraft(draft);
    if (await this.repository.getByQuestionId(normalized.questionId)) {
      throw new DuplicateQuestionIdError(normalized.questionId);
    }
    const now = new Date();
    const raw: Problem = {
      ...normalized,
      qualityScore: 0,
      status: "raw",
      validation: {
        answerPresent: false,
        explanationPresent: false,
        structurallyValid: false,
      },
      embedding: await this.embeddingProvider.embed(problemEmbeddingText(normalized)),
      contentFingerprint: problemFingerprint(normalized),
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.createRaw(raw);

    const outcome = this.validationService.validate(normalized);
    if (!outcome.approved) {
      const rejected: Problem = {
        ...raw,
        qualityScore: outcome.qualityScore,
        status: "rejected",
        validation: outcome.validation,
        updatedAt: new Date(),
      };
      await this.repository.updateProblem(rejected);
      return { problem: rejected, transition: "raw_to_rejected" };
    }

    const validated: Problem = {
      ...raw,
      qualityScore: outcome.qualityScore,
      validation: outcome.validation,
      updatedAt: new Date(),
    };
    const duplicate = await this.duplicateService.findDuplicate(validated);
    if (duplicate) {
      const duplicateProblem: Problem = {
        ...validated,
        status: "duplicate",
        duplicateClusterId: duplicate.clusterId,
        updatedAt: new Date(),
      };
      const canonical = {
        ...duplicate.canonical,
        duplicateClusterId: duplicate.clusterId,
        updatedAt: new Date(),
      };
      const cluster: DuplicateCluster = {
        clusterId: duplicate.clusterId,
        canonicalQuestionId: canonical.questionId,
        memberQuestionIds: [canonical.questionId, duplicateProblem.questionId],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await Promise.all([
        this.repository.updateProblem(canonical),
        this.repository.updateProblem(duplicateProblem),
        this.repository.saveDuplicateCluster(cluster),
      ]);
      return { problem: duplicateProblem, transition: "raw_to_duplicate" };
    }

    const approved: Problem = {
      ...validated,
      status: "approved",
      updatedAt: new Date(),
    };
    await this.repository.updateProblem(approved);
    return { problem: approved, transition: "raw_to_approved" };
  }
}
