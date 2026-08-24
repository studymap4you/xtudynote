import type { ProblemTime } from "./problem.js";

export interface GenerationRun {
  generationRunId: string;
  userRequest: string;
  requestedQuestionCount: number;
  reusedQuestionCount: number;
  generatedQuestionCount: number;
  rejectedQuestionCount: number;
  savedQuestionCount: number;
  modelsUsed: string[];
  durationMs: number;
  reuseRate: number;
  createdAt: ProblemTime;
  updatedAt: ProblemTime;
}

export interface UsageEvent {
  eventId: string;
  questionId: string;
  workbookId: string;
  timestamp: ProblemTime;
}

export interface DuplicateCluster {
  clusterId: string;
  canonicalQuestionId: string;
  memberQuestionIds: string[];
  createdAt: ProblemTime;
  updatedAt: ProblemTime;
}
