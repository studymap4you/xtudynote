import type { User } from "firebase/auth";

export type ExamCollectionStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

export interface ExamCollectionJob {
  id: string;
  status: ExamCollectionStatus;
  subject: string;
  grades: number[];
  months: number[];
  startYear: number;
  endYear: number;
  totalTargets: number;
  completedTargets: number;
  failedTargets: number;
  uploadedFiles: number;
  skippedFiles: number;
  dbRegisteredCount: number;
  currentTarget: string | null;
  error: string | null;
  requestedByEmail: string | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

export interface CollectedExam {
  id: string;
  year: number;
  grade: number;
  month: number;
  subject: string;
  organizer: string;
  questionFilePath: string | null;
  answerFilePath: string | null;
  scriptFilePath: string | null;
  parseStatus: string;
  collectedAt: string | null;
  updatedAt: string | null;
}

export interface ExamCollectionTarget {
  id: string;
  grade: number;
  year: number;
  month: number;
  status: string;
  discoveredFiles: number;
  uploadedFiles: number;
  skippedFiles: number;
  dbRegistered: boolean;
  error: string | null;
  updatedAt: string | null;
}

export interface ExamCollectorState {
  projectId: string;
  storageBucket: string;
  jobs: ExamCollectionJob[];
  exams: CollectedExam[];
  targets: ExamCollectionTarget[];
}

const ERROR_MESSAGES: Record<string, string> = {
  "authentication-required": "로그인이 필요합니다.",
  "super-admin-only": "슈퍼 관리자만 사용할 수 있습니다.",
  "problem-bank-not-configured": "문제은행 서버 연결이 설정되지 않았습니다.",
  "problem-bank-permission-denied": "문제은행 프로젝트 접근 권한이 없습니다.",
  "year-range-invalid": "연도 범위를 확인해주세요.",
  "grades-invalid": "학년 선택을 확인해주세요.",
  "months-invalid": "시행 월 선택을 확인해주세요.",
};

async function request<T>(user: User, init?: RequestInit, jobId?: string): Promise<T> {
  const idToken = await user.getIdToken();
  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  const response = await fetch(`/api/admin-exam-collector${query}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const code = String(payload.error || "request-failed");
    throw new Error(ERROR_MESSAGES[code] || "모의고사 수집 정보를 불러오지 못했습니다.");
  }
  return payload;
}

export function loadExamCollectorState(user: User, jobId?: string) {
  return request<ExamCollectorState>(user, undefined, jobId);
}

export async function enqueueExamCollection(
  user: User,
  input: { grades: number[]; months: number[]; startYear: number; endYear: number },
) {
  return request<{ ok: true; job: ExamCollectionJob }>(user, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
