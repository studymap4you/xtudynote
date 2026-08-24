import type { Problem, ProblemSearchQuery } from "../models/problem.js";
import { createPermanentId } from "../utils/ids.js";
import { normalizeComparableText } from "../utils/normalization.js";
import type { ProblemRepository } from "./problemRepository.js";
import type { ProblemSearchProvider } from "./problemSearchService.js";

export interface DuplicateMatch {
  canonical: Problem;
  clusterId: string;
  reason: "fingerprint" | "semantic";
}

function problemText(problem: Problem): string {
  return [problem.passage, problem.question, ...(problem.choices || [])].filter(Boolean).join("\n");
}

export class DuplicateService {
  constructor(
    private readonly repository: ProblemRepository,
    private readonly searchProvider: ProblemSearchProvider,
  ) {}

  async findDuplicate(problem: Problem): Promise<DuplicateMatch | null> {
    const exact = (await this.repository.findByFingerprint(problem.contentFingerprint, 6))
      .find((candidate) => candidate.questionId !== problem.questionId && candidate.status !== "rejected");
    if (exact) {
      return {
        canonical: exact,
        clusterId: exact.duplicateClusterId || createPermanentId("XUC"),
        reason: "fingerprint",
      };
    }

    const query: ProblemSearchQuery = {
      subject: problem.subject,
      language: problem.language,
      examFamily: problem.examFamily,
      grade: problem.grade,
      questionType: problem.questionType,
      subtype: problem.subtype,
      difficulty: problem.difficulty,
      count: 5,
      sourceText: problemText(problem),
      conceptTags: problem.conceptTags,
      skillTags: problem.skillTags,
      excludeQuestionIds: [problem.questionId],
    };
    const result = await this.searchProvider.searchSimilarProblems(query);
    const normalized = normalizeComparableText(problemText(problem));
    const semantic = result.problems.find((candidate) => {
      if (candidate.semanticSimilarity < 0.985) return false;
      const candidateText = normalizeComparableText(problemText(candidate.problem));
      return candidateText === normalized || candidate.score >= 0.92;
    });
    if (!semantic) return null;
    return {
      canonical: semantic.problem,
      clusterId: semantic.problem.duplicateClusterId || createPermanentId("XUC"),
      reason: "semantic",
    };
  }
}
