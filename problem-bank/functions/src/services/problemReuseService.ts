import type { Problem, ProblemDraft, ProblemSearchQuery } from "../models/problem.js";
import type { ProblemSaveService } from "./problemSaveService.js";
import type { ProblemSearchProvider } from "./problemSearchService.js";

export interface ReuseFulfillmentResult {
  requestedCount: number;
  reusedQuestionCount: number;
  generatedQuestionCount: number;
  rejectedQuestionCount: number;
  savedQuestionCount: number;
  missingBeforeGeneration: number;
  problems: Problem[];
}

export class ProblemReuseService {
  constructor(
    private readonly searchProvider: ProblemSearchProvider,
    private readonly saveService: ProblemSaveService,
  ) {}

  async fulfill(
    query: ProblemSearchQuery,
    generateMissing: (missingCount: number) => Promise<ProblemDraft[]>,
  ): Promise<ReuseFulfillmentResult> {
    const search = await this.searchProvider.searchSimilarProblems(query);
    const missingBeforeGeneration = Math.max(0, query.count - search.foundCount);
    const generatedDrafts = missingBeforeGeneration > 0
      ? await generateMissing(missingBeforeGeneration)
      : [];
    const saved = [];
    let rejectedQuestionCount = 0;
    for (const draft of generatedDrafts.slice(0, missingBeforeGeneration)) {
      const result = await this.saveService.save(draft);
      if (result.problem.status === "approved" || result.problem.status === "gold") {
        saved.push(result.problem);
      } else {
        rejectedQuestionCount += 1;
      }
    }
    return {
      requestedCount: query.count,
      reusedQuestionCount: search.problems.length,
      generatedQuestionCount: generatedDrafts.length,
      rejectedQuestionCount,
      savedQuestionCount: saved.length,
      missingBeforeGeneration,
      problems: [...search.problems.map((item) => item.problem), ...saved].slice(0, query.count),
    };
  }
}
