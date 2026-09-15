import type { User } from "firebase/auth";
import type { GeneratedCsatQuestion } from "@/types/csatQuestionEngine";

export type CurriculumVariantSeriesId =
  | "ebs_special_lecture_2027_er_v2"
  | "ebs_complete_2027_v2";

export type CurriculumVariantSeries = {
  id: CurriculumVariantSeriesId;
  category: string;
  title: string;
  target: string;
};

export type CurriculumVariantWorkbookItem = {
  key: string;
  questionId: string;
  groupId: string;
  groupLabel: string;
  groupOrder: number;
  sourceId: string;
  sourceLabel: string;
  sourceOrder: number;
  variantType: string;
  label: string;
  variantIndex?: number;
  sourcePage?: number;
};

export type CurriculumVariantAvailability = {
  series: CurriculumVariantSeries;
  items: CurriculumVariantWorkbookItem[];
  totalCount: number;
};

export type CurriculumVariantBuildResult = {
  questions: GeneratedCsatQuestion[];
  selectedCount: number;
  outputCount: number;
  excludedCount: number;
};

const ERROR_MESSAGES: Record<string, string> = {
  "authentication-required": "로그인이 필요합니다.",
  "active-account-required": "활성 사용자만 문제집을 만들 수 있습니다.",
  "premium-subscription-required": "구독 결제 후 문제집을 만들 수 있습니다.",
  "problem-bank-not-configured": "문제은행 연결이 설정되지 않았습니다.",
  "problem-bank-permission-denied": "문제은행에 연결할 수 없습니다.",
  "series-invalid": "선택한 교재 시리즈를 찾을 수 없습니다.",
  "selection-empty": "출력할 변형문제를 선택해주세요.",
  "selection-unavailable": "선택한 문항 중 현재 등록되지 않은 문제가 있습니다.",
  "target-count-invalid": "출력 문제 수가 올바르지 않습니다.",
  "target-count-exceeds-selection": "선택한 문항보다 출력 문제 수가 많습니다.",
};

async function request<T>(user: User, body: Record<string, unknown>): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch("/api/curriculum-variant-workbook", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(ERROR_MESSAGES[payload.error || ""] || "교재 변형문제 데이터를 처리하지 못했습니다.");
  }
  return payload;
}

export async function loadCurriculumVariantItems(
  user: User,
  seriesId: CurriculumVariantSeriesId,
): Promise<CurriculumVariantAvailability> {
  const payload = await request<CurriculumVariantAvailability>(user, {
    action: "availability",
    seriesId,
  });
  return {
    series: payload.series,
    items: Array.isArray(payload.items) ? payload.items : [],
    totalCount: Number(payload.totalCount) || 0,
  };
}

export async function buildCurriculumVariantWorkbook(
  user: User,
  input: { seriesId: CurriculumVariantSeriesId; selections: string[]; targetCount: number },
): Promise<CurriculumVariantBuildResult> {
  return request<CurriculumVariantBuildResult>(user, { action: "build", ...input });
}
