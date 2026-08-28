import type { User } from "firebase/auth";
import type { GeneratedCsatQuestion } from "@/types/csatQuestionEngine";

export type ExamWorkbookItemKind = "original" | "variant";

export type ExamWorkbookItem = {
  key: string;
  questionNumber: number;
  kind: ExamWorkbookItemKind;
  variantType: string | null;
  label: string;
  variantIndex?: number;
};

export type ExamWorkbookBuildResult = {
  questions: GeneratedCsatQuestion[];
  selectedCount: number;
  outputCount: number;
  excludedCount: number;
};

const ERROR_MESSAGES: Record<string, string> = {
  "authentication-required": "로그인이 필요합니다.",
  "active-account-required": "활성 사용자만 문제집을 만들 수 있습니다.",
  "premium-subscription-required": "구독 결제 후 문제집을 만들 수 있습니다.",
  "exam-not-found": "시험 자료를 찾을 수 없습니다.",
  "selection-empty": "출력할 원형 또는 변형문제를 선택해주세요.",
  "selection-unavailable": "선택한 문항 중 현재 등록되지 않은 문제가 있습니다.",
  "target-count-exceeds-selection": "선택한 문항보다 출력 문제 수가 많습니다.",
};

async function request<T>(user: User, init: RequestInit): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch("/api/exam-workbook", {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(ERROR_MESSAGES[payload.error || ""] || "문제집 데이터를 처리하지 못했습니다.");
  return payload;
}

export async function loadExamWorkbookItems(user: User, examId: string): Promise<ExamWorkbookItem[]> {
  const payload = await request<{ items: ExamWorkbookItem[] }>(user, { method: "POST", body: JSON.stringify({ action: "availability", examId }) });
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function buildExamWorkbook(
  user: User,
  input: { examId: string; selections: string[]; targetCount: number },
): Promise<ExamWorkbookBuildResult> {
  return request<ExamWorkbookBuildResult>(user, { method: "POST", body: JSON.stringify({ action: "build", ...input }) });
}

export function resolveOutputCount(selectedCount: number, requested: number | "all") {
  if (requested === "all") return selectedCount;
  if (!Number.isInteger(requested) || requested < 1) return 0;
  return requested;
}

export function selectionShortfall(selectedCount: number, requested: number | "all") {
  return Math.max(0, resolveOutputCount(selectedCount, requested) - selectedCount);
}
