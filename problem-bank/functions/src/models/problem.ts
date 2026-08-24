import type { Timestamp } from "firebase-admin/firestore";

export const PROBLEM_STATUSES = ["raw", "approved", "gold", "rejected", "duplicate"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];
export type ProblemTime = Timestamp | Date;

export interface ProblemValidation {
  answerPresent: boolean;
  explanationPresent: boolean;
  structurallyValid: boolean;
  issues?: string[];
}

export interface ProblemGenerator {
  provider?: string;
  model?: string;
  version?: string;
}

export interface Problem {
  questionId: string;
  subject: string;
  language: string;
  examFamily: string;
  grade?: number;
  questionType: string;
  subtype?: string;
  difficulty: number;
  sourceId?: string;
  passage?: string;
  question: string;
  choices?: string[];
  answer: string | number;
  explanation?: string;
  conceptTags: string[];
  skillTags: string[];
  qualityScore: number;
  status: ProblemStatus;
  validation: ProblemValidation;
  generator?: ProblemGenerator;
  embedding: number[];
  contentFingerprint: string;
  duplicateClusterId?: string;
  usageCount: number;
  lastUsedAt?: ProblemTime;
  createdAt: ProblemTime;
  updatedAt: ProblemTime;
}

export interface ProblemDraft {
  questionId?: string;
  subject: string;
  language?: string;
  examFamily: string;
  grade?: number;
  questionType: string;
  subtype?: string;
  difficulty: number;
  sourceId?: string;
  passage?: string;
  question: string;
  choices?: string[];
  answer?: string | number;
  explanation?: string;
  conceptTags?: string[];
  skillTags?: string[];
  generator?: ProblemGenerator;
}

export interface NormalizedProblemDraft extends Omit<ProblemDraft, "questionId" | "answer"> {
  questionId: string;
  language: string;
  answer: string | number;
  conceptTags: string[];
  skillTags: string[];
}

export interface ProblemSearchQuery {
  subject: string;
  language?: string;
  examFamily: string;
  grade?: number;
  questionType: string;
  subtype?: string;
  difficulty: number;
  count: number;
  sourceText: string;
  conceptTags?: string[];
  skillTags?: string[];
  excludeQuestionIds?: string[];
  workbookId?: string;
}

export interface SearchScoreBreakdown {
  semantic: number;
  typeMatch: number;
  difficultyMatch: number;
  conceptMatch: number;
  quality: number;
  usageDiversity: number;
  recentUsePenalty: number;
}

export interface ProblemSearchResult {
  problem: Problem;
  score: number;
  semanticSimilarity: number;
  breakdown: SearchScoreBreakdown;
}

export interface ProblemSearchResponse {
  requestedCount: number;
  foundCount: number;
  missingCount: number;
  searchMode: "firestore-vector" | "metadata-fallback" | "in-memory";
  problems: ProblemSearchResult[];
}
