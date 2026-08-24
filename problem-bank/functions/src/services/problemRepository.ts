import {
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import type { DuplicateCluster, GenerationRun, UsageEvent } from "../models/generationRun.js";
import type { Problem, ProblemSearchQuery, ProblemStatus } from "../models/problem.js";
import type { Source } from "../models/source.js";
import { createPermanentId, internalDocumentId } from "../utils/ids.js";

export class DuplicateQuestionIdError extends Error {
  constructor(questionId: string) {
    super(`Question ID already exists: ${questionId}`);
    this.name = "DuplicateQuestionIdError";
  }
}

export interface ProblemRepository {
  createRaw(problem: Problem): Promise<void>;
  updateProblem(problem: Problem): Promise<void>;
  getByQuestionId(questionId: string): Promise<Problem | null>;
  findByFingerprint(fingerprint: string, limit?: number): Promise<Problem[]>;
  listCandidates(
    query: ProblemSearchQuery,
    statuses: ProblemStatus[],
    limit: number,
  ): Promise<Problem[]>;
  saveDuplicateCluster(cluster: DuplicateCluster): Promise<void>;
  recordUsage(questionId: string, workbookId: string): Promise<{ recorded: boolean; event?: UsageEvent }>;
  saveGenerationRun(run: GenerationRun): Promise<void>;
  saveSource(source: Source): Promise<void>;
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (
    value
    && typeof value === "object"
    && !(value instanceof Date)
    && Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, removeUndefined(child)]),
    );
  }
  return value;
}

function serializeProblem(problem: Problem): Record<string, unknown> {
  return removeUndefined({
    ...problem,
    embedding: FieldValue.vector(problem.embedding),
  }) as Record<string, unknown>;
}

function vectorArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  const vector = value as { toArray?: () => unknown } | null;
  if (vector && typeof vector.toArray === "function") {
    const array = vector.toArray();
    return Array.isArray(array) ? array.map(Number) : [];
  }
  return [];
}

export function problemFromSnapshot(snapshot: DocumentSnapshot): Problem {
  const data = snapshot.data() || {};
  return {
    questionId: String(data.questionId || ""),
    subject: String(data.subject || ""),
    language: String(data.language || ""),
    examFamily: String(data.examFamily || ""),
    grade: Number.isInteger(data.grade) ? Number(data.grade) : undefined,
    questionType: String(data.questionType || ""),
    subtype: data.subtype ? String(data.subtype) : undefined,
    difficulty: Number(data.difficulty) || 0,
    sourceId: data.sourceId ? String(data.sourceId) : undefined,
    passage: data.passage ? String(data.passage) : undefined,
    question: String(data.question || ""),
    choices: Array.isArray(data.choices) ? data.choices.map(String) : undefined,
    answer: typeof data.answer === "number" ? data.answer : String(data.answer || ""),
    explanation: data.explanation ? String(data.explanation) : undefined,
    conceptTags: Array.isArray(data.conceptTags) ? data.conceptTags.map(String) : [],
    skillTags: Array.isArray(data.skillTags) ? data.skillTags.map(String) : [],
    qualityScore: Number(data.qualityScore) || 0,
    status: data.status as ProblemStatus,
    validation: data.validation || {
      answerPresent: false,
      explanationPresent: false,
      structurallyValid: false,
    },
    generator: data.generator,
    embedding: vectorArray(data.embedding),
    contentFingerprint: String(data.contentFingerprint || ""),
    duplicateClusterId: data.duplicateClusterId ? String(data.duplicateClusterId) : undefined,
    usageCount: Number(data.usageCount) || 0,
    lastUsedAt: data.lastUsedAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export class FirestoreProblemRepository implements ProblemRepository {
  constructor(private readonly firestore: Firestore) {}

  private problemRef(questionId: string) {
    return this.firestore.collection("problems").doc(internalDocumentId("problem", questionId));
  }

  async createRaw(problem: Problem): Promise<void> {
    try {
      await this.problemRef(problem.questionId).create(serializeProblem(problem));
    } catch (error) {
      const code = String((error as { code?: unknown }).code || "");
      if (code === "6" || code === "already-exists") throw new DuplicateQuestionIdError(problem.questionId);
      throw error;
    }
  }

  async updateProblem(problem: Problem): Promise<void> {
    await this.problemRef(problem.questionId).set(serializeProblem(problem), { merge: false });
  }

  async getByQuestionId(questionId: string): Promise<Problem | null> {
    const snapshot = await this.problemRef(questionId).get();
    if (!snapshot.exists) return null;
    const problem = problemFromSnapshot(snapshot);
    return problem.questionId === questionId ? problem : null;
  }

  async findByFingerprint(fingerprint: string, limit = 5): Promise<Problem[]> {
    const snapshot = await this.firestore
      .collection("problems")
      .where("contentFingerprint", "==", fingerprint)
      .limit(limit)
      .get();
    return snapshot.docs.map(problemFromSnapshot);
  }

  async listCandidates(
    query: ProblemSearchQuery,
    statuses: ProblemStatus[],
    limit: number,
  ): Promise<Problem[]> {
    let candidateQuery: Query = this.firestore
      .collection("problems")
      .where("subject", "==", query.subject)
      .where("examFamily", "==", query.examFamily)
      .where("questionType", "==", query.questionType)
      .where("status", "in", statuses);
    if (query.language) candidateQuery = candidateQuery.where("language", "==", query.language);
    const snapshot = await candidateQuery.limit(limit).get();
    return snapshot.docs.map(problemFromSnapshot);
  }

  async saveDuplicateCluster(cluster: DuplicateCluster): Promise<void> {
    const ref = this.firestore
      .collection("duplicate_clusters")
      .doc(internalDocumentId("cluster", cluster.clusterId));
    await ref.set(
      {
        clusterId: cluster.clusterId,
        canonicalQuestionId: cluster.canonicalQuestionId,
        memberQuestionIds: FieldValue.arrayUnion(...cluster.memberQuestionIds),
        createdAt: cluster.createdAt,
        updatedAt: cluster.updatedAt,
      },
      { merge: true },
    );
  }

  async recordUsage(
    questionId: string,
    workbookId: string,
  ): Promise<{ recorded: boolean; event?: UsageEvent }> {
    const eventDocumentId = internalDocumentId("usage", `${workbookId}:${questionId}`);
    const eventRef = this.firestore.collection("usage_events").doc(eventDocumentId);
    const problemRef = this.problemRef(questionId);
    return this.firestore.runTransaction(async (transaction) => {
      const [eventSnapshot, problemSnapshot] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(problemRef),
      ]);
      if (eventSnapshot.exists) return { recorded: false };
      if (!problemSnapshot.exists) throw new Error("problem_not_found");
      const timestamp = new Date();
      const event: UsageEvent = {
        eventId: createPermanentId("XUE"),
        questionId,
        workbookId,
        timestamp,
      };
      transaction.create(eventRef, event);
      transaction.update(problemRef, {
        usageCount: FieldValue.increment(1),
        lastUsedAt: timestamp,
        updatedAt: timestamp,
      });
      return { recorded: true, event };
    });
  }

  async saveGenerationRun(run: GenerationRun): Promise<void> {
    const ref = this.firestore
      .collection("generation_runs")
      .doc(internalDocumentId("generation", run.generationRunId));
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = removeUndefined({
        ...run,
        createdAt: snapshot.exists ? snapshot.get("createdAt") : run.createdAt,
      }) as Record<string, unknown>;
      transaction.set(ref, data, { merge: true });
    });
  }

  async saveSource(source: Source): Promise<void> {
    const data = removeUndefined(source) as Record<string, unknown>;
    await this.firestore
      .collection("sources")
      .doc(internalDocumentId("source", source.sourceId))
      .set(data, { merge: false });
  }
}
