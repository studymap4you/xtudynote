import { auth } from "@/firebase/config";
import type {
  CsatQuestionBatchResult,
  CsatQuestionJob,
  CsatQuestionJobSummary,
  CsatQuestionProgressSnapshot,
} from "@/types/csatQuestionEngine";

type UploadedFileMetadata = {
  name: string;
  size: number;
  type: string;
};

async function engineRequest<T>(path = "", init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인 후 수능 영어 문제를 생성할 수 있습니다.");
  const idToken = await user.getIdToken();
  const response = await fetch(`/api/csat-question-engine${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "문제 생성 엔진 요청에 실패했습니다.");
  return payload;
}

export async function startCsatQuestionJob(params: {
  userRequest: string;
  sourceText: string;
  uploadedFiles: UploadedFileMetadata[];
}): Promise<CsatQuestionJob> {
  const payload = await engineRequest<{ job: CsatQuestionJob }>("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", ...params }),
  });
  return payload.job;
}

export function generateNextCsatQuestionBatch(jobId: string): Promise<CsatQuestionBatchResult> {
  return engineRequest<CsatQuestionBatchResult>("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "next-batch", jobId }),
  });
}

export async function listCsatQuestionJobs(): Promise<CsatQuestionJobSummary[]> {
  const payload = await engineRequest<{ items: CsatQuestionJobSummary[] }>();
  return payload.items;
}

export async function getCsatQuestionJob(id: string): Promise<CsatQuestionJob> {
  const payload = await engineRequest<{ job: CsatQuestionJob }>(`?id=${encodeURIComponent(id)}`);
  return payload.job;
}

export async function getCsatQuestionProgress(id: string, afterSequence: number): Promise<CsatQuestionProgressSnapshot> {
  const payload = await engineRequest<{ progress: CsatQuestionProgressSnapshot }>(
    `?id=${encodeURIComponent(id)}&mode=progress&after=${Math.max(0, Math.floor(afterSequence))}`,
  );
  return payload.progress;
}

export async function deleteCsatQuestionJob(id: string): Promise<void> {
  await engineRequest<{ ok: true }>(`?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
