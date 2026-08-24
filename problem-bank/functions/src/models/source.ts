import type { ProblemTime } from "./problem.js";

export const SOURCE_TYPES = [
  "csat",
  "mock_exam",
  "textbook",
  "paper",
  "article",
  "user_upload",
  "other",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export interface Source {
  sourceId: string;
  title?: string;
  sourceType: SourceType;
  text: string;
  metadata?: Record<string, unknown>;
  createdAt: ProblemTime;
}
