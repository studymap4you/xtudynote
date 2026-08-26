import type { User } from "firebase/auth";

export type OfficialExamFileType = "question" | "answer" | "script";

export interface OfficialExamResource {
  id: string;
  title: string;
  year: number;
  grade: number;
  month: number;
  organizer: string;
  collectedAt: string | null;
  files: OfficialExamFileType[];
}

const OFFICIAL_EXAM_FILE_TYPES = new Set<OfficialExamFileType>(["question", "answer", "script"]);

const ERROR_MESSAGES: Record<string, string> = {
  "authentication-required": "로그인이 필요합니다.",
  "active-account-required": "활성 사용자만 자료를 이용할 수 있습니다.",
  "premium-subscription-required": "구독 결제 후 자료를 다운로드할 수 있습니다.",
  "problem-bank-not-configured": "공식 모의고사 자료 연결이 설정되지 않았습니다.",
  "problem-bank-permission-denied": "공식 모의고사 자료 저장소에 연결할 수 없습니다.",
  "exam-not-found": "시험 자료를 찾을 수 없습니다.",
  "exam-file-not-found": "선택한 파일이 등록되어 있지 않습니다.",
};

async function apiRequest<T>(user: User | null, url: string): Promise<T> {
  const token = user ? await user.getIdToken() : null;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const code = String(payload.error || "request-failed");
    throw new Error(ERROR_MESSAGES[code] || "공식 모의고사 자료를 불러오지 못했습니다.");
  }
  return payload;
}

export async function loadOfficialExamResources(grade: number): Promise<OfficialExamResource[]> {
  const payload = await apiRequest<{ items?: unknown }>(
    null,
    `/api/exam-library?grade=${encodeURIComponent(grade)}`,
  );
  return normalizeOfficialExamResources(payload.items);
}

export function normalizeOfficialExamResources(value: unknown): OfficialExamResource[] {
  if (!Array.isArray(value)) {
    throw new Error("공식 모의고사 자료 응답 형식이 올바르지 않습니다.");
  }
  return value.flatMap((raw): OfficialExamResource[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const id = String(item.id ?? "").trim();
    const files = Array.isArray(item.files)
      ? [...new Set(item.files.map(String).filter(
          (fileType): fileType is OfficialExamFileType =>
            OFFICIAL_EXAM_FILE_TYPES.has(fileType as OfficialExamFileType),
        ))]
      : [];
    if (!id || files.length === 0) return [];
    const grade = Number(item.grade) || 0;
    const month = Number(item.month) || 0;
    return [{
      id,
      title: String(item.title ?? "").trim() || `고${grade || "-"} ${month || "-"}월 영어 모의고사`,
      year: Number(item.year) || 0,
      grade,
      month,
      organizer: String(item.organizer ?? "").trim() || "EBSi",
      collectedAt: typeof item.collectedAt === "string" ? item.collectedAt : null,
      files,
    }];
  });
}

export async function getOfficialExamDownloadUrl(
  user: User,
  examId: string,
  fileType: OfficialExamFileType,
): Promise<string> {
  const params = new URLSearchParams({ examId, fileType });
  const payload = await apiRequest<{ url: string }>(user, `/api/exam-library?${params.toString()}`);
  return payload.url;
}
