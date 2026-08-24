export type CsatQuestionDifficulty = "low" | "medium" | "high";

export type CsatQuestionChoice = {
  index: number;
  text: string;
  isCorrect: boolean;
  distractorPattern?: string;
  rationale: string;
};

export type GeneratedCsatQuestion = {
  id: string;
  sequence: number;
  questionType: string;
  difficulty: CsatQuestionDifficulty;
  scoreSuggestion: 2 | 3;
  sourceId: string;
  referenceQuestionIds: string[];
  passage: string;
  stem: string;
  choices: CsatQuestionChoice[];
  answer: number;
  explanation: string;
  evidence: {
    supportingSentence?: string;
    reasoning: string;
  };
  semanticFingerprint: string;
  qualityMetadata: {
    batchId: string;
    generationAttempt: number;
    rawCorrectCount?: number;
    rawAnswerConsistent?: boolean;
  };
};

export type StructuredCsatQuestionRequest = {
  userRequest: string;
  targetGrade: string;
  targetLevel: CsatQuestionDifficulty;
  targetQuestionCount: number;
  requestedTypes: string[];
  pageTargetDetected: boolean;
};

export type CsatQuestionJobStatus = "planned" | "generating" | "completed" | "failed" | "paused";

export type CsatProgressEventStatus = "running" | "completed" | "info" | "warning" | "error";

export type CsatProgressEvent = {
  id: string;
  sequence: number;
  phase: string;
  status: CsatProgressEventStatus;
  title: string;
  summary?: string;
  details: string[];
  batchNumber?: number;
  createdAt: string;
};

export type CsatQuestionJobSummary = {
  id: string;
  title: string;
  status: CsatQuestionJobStatus;
  userRequest: string;
  targetQuestionCount: number;
  acceptedCount: number;
  rejectedCount: number;
  modelCallCount: number;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CsatQuestionJob = CsatQuestionJobSummary & {
  request: StructuredCsatQuestionRequest;
  questionTypePlan: string[];
  questions: GeneratedCsatQuestion[];
  model?: string;
  provider?: string;
  rulesVersion: string;
  consecutiveFailedBatches?: number;
  sourceCandidateCount?: number;
  questionBankRecordCount?: number;
  warning?: string;
  progressSequence: number;
  progressEvents: CsatProgressEvent[];
  latestProgress?: CsatProgressEvent;
};

export type CsatQuestionProgressSnapshot = {
  jobId: string;
  status: CsatQuestionJobStatus;
  acceptedCount: number;
  rejectedCount: number;
  modelCallCount: number;
  retryCount: number;
  model?: string;
  warning?: string;
  progressSequence: number;
  progressEvents: CsatProgressEvent[];
  latestProgress?: CsatProgressEvent;
};

export type CsatProviderAttempt = {
  model: string;
  attempt: number;
  status: number | null;
  durationMs: number;
  error: string | null;
};

export type CsatQuestionBatchResult = {
  job: CsatQuestionJob;
  batchQuestions: GeneratedCsatQuestion[];
  batch: {
    id: string;
    requested: number;
    accepted: number;
    rejected: number;
    modelCallCount: number;
    retryCount: number;
    exhausted: boolean;
    model?: string;
    modelsUsed?: string[];
    providerAttempts?: CsatProviderAttempt[];
  };
};
