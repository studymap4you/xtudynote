import type { Firestore, Query } from "firebase-admin/firestore";
import type {
  Problem,
  ProblemSearchQuery,
  ProblemSearchResponse,
  ProblemSearchResult,
  ProblemStatus,
} from "../models/problem.js";
import { cosineSimilarity, scoreProblem } from "../utils/scoring.js";
import { queryEmbeddingText, type EmbeddingProvider } from "./embeddingService.js";
import {
  problemFromSnapshot,
  type ProblemRepository,
} from "./problemRepository.js";

const SEARCHABLE_STATUSES: ProblemStatus[] = ["approved", "gold"];

export interface ProblemSearchProvider {
  searchSimilarProblems(query: ProblemSearchQuery): Promise<ProblemSearchResponse>;
}

export type SearchWarningHandler = (message: string, context?: Record<string, unknown>) => void;

function candidateLimit(count: number): number {
  return Math.min(200, Math.max(20, count * 8));
}

function selectDiverseResults(
  candidates: Array<{ problem: Problem; semanticSimilarity: number }>,
  query: ProblemSearchQuery,
): ProblemSearchResult[] {
  const excluded = new Set(query.excludeQuestionIds || []);
  const selectedClusters = new Set<string>();
  const ranked = candidates
    .filter(({ problem }) => !excluded.has(problem.questionId))
    .map(({ problem, semanticSimilarity }) => ({
      problem,
      semanticSimilarity,
      ...scoreProblem(problem, query, semanticSimilarity),
    }))
    .sort((left, right) => right.score - left.score || left.problem.questionId.localeCompare(right.problem.questionId));

  const selected: ProblemSearchResult[] = [];
  for (const candidate of ranked) {
    const cluster = candidate.problem.duplicateClusterId;
    if (cluster && selectedClusters.has(cluster)) continue;
    selected.push(candidate);
    if (cluster) selectedClusters.add(cluster);
    if (selected.length >= query.count) break;
  }
  return selected;
}

export class FirestoreProblemSearchProvider implements ProblemSearchProvider {
  constructor(
    private readonly firestore: Firestore,
    private readonly repository: ProblemRepository,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly onWarning?: SearchWarningHandler,
  ) {}

  private metadataQuery(query: ProblemSearchQuery): Query {
    let firestoreQuery: Query = this.firestore
      .collection("problems")
      .where("subject", "==", query.subject)
      .where("examFamily", "==", query.examFamily)
      .where("questionType", "==", query.questionType)
      .where("status", "in", SEARCHABLE_STATUSES);
    if (query.language) firestoreQuery = firestoreQuery.where("language", "==", query.language);
    return firestoreQuery;
  }

  async searchSimilarProblems(query: ProblemSearchQuery): Promise<ProblemSearchResponse> {
    const queryVector = await this.embeddingProvider.embed(queryEmbeddingText(query));
    let searchMode: ProblemSearchResponse["searchMode"] = "firestore-vector";
    let candidates: Array<{ problem: Problem; semanticSimilarity: number }>;
    try {
      const snapshot = await this.metadataQuery(query).findNearest({
        vectorField: "embedding",
        queryVector,
        limit: candidateLimit(query.count),
        distanceMeasure: "COSINE",
        distanceResultField: "vectorDistance",
      }).get();
      candidates = snapshot.docs.map((document) => {
        const distance = Number(document.get("vectorDistance"));
        return {
          problem: problemFromSnapshot(document),
          semanticSimilarity: Number.isFinite(distance) ? 1 - distance : 0,
        };
      });
    } catch (error) {
      searchMode = "metadata-fallback";
      this.onWarning?.("firestore_vector_search_fallback", {
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
      });
      const fallback = await this.repository.listCandidates(
        query,
        SEARCHABLE_STATUSES,
        candidateLimit(query.count),
      );
      candidates = fallback.map((problem) => ({
        problem,
        semanticSimilarity: cosineSimilarity(problem.embedding, queryVector),
      }));
    }

    const problems = selectDiverseResults(candidates, query);
    return {
      requestedCount: query.count,
      foundCount: problems.length,
      missingCount: Math.max(0, query.count - problems.length),
      searchMode,
      problems,
    };
  }
}

export class InMemoryProblemSearchProvider implements ProblemSearchProvider {
  constructor(
    private readonly problems: () => Problem[],
    private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  async searchSimilarProblems(query: ProblemSearchQuery): Promise<ProblemSearchResponse> {
    const queryVector = await this.embeddingProvider.embed(queryEmbeddingText(query));
    const candidates = this.problems()
      .filter((problem) => SEARCHABLE_STATUSES.includes(problem.status))
      .filter((problem) => problem.subject === query.subject)
      .filter((problem) => problem.examFamily === query.examFamily)
      .filter((problem) => problem.questionType === query.questionType)
      .map((problem) => ({
        problem,
        semanticSimilarity: cosineSimilarity(problem.embedding, queryVector),
      }));
    const problems = selectDiverseResults(candidates, query);
    return {
      requestedCount: query.count,
      foundCount: problems.length,
      missingCount: Math.max(0, query.count - problems.length),
      searchMode: "in-memory",
      problems,
    };
  }
}
