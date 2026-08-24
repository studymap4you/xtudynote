import type { User } from "firebase/auth";
import type { TextbookResourceCategoryId } from "@/types/curriculumResource";

export interface OfficialTextbookResource {
  id: string;
  category: TextbookResourceCategoryId;
  title: string;
  courseTitle: string;
  publisher: string;
  leadAuthor: string;
  collectedAt: string | null;
  size: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  "authentication-required": "로그인이 필요합니다.",
  "active-account-required": "활성 사용자만 자료를 이용할 수 있습니다.",
  "problem-bank-not-configured": "교과서 자료 저장소 연결이 설정되지 않았습니다.",
  "problem-bank-permission-denied": "교과서 자료 저장소에 연결할 수 없습니다.",
  "textbook-source-forbidden": "이 교과서 자료를 열 권한이 없습니다.",
  "textbook-source-not-found": "교과서 자료를 찾을 수 없습니다.",
  "textbook-file-not-found": "교과서 원문 파일이 아직 등록되지 않았습니다.",
};

async function authenticatedRequest<T>(user: User, url: string): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const code = String(payload.error || "request-failed");
    throw new Error(ERROR_MESSAGES[code] || "교과서 자료를 불러오지 못했습니다.");
  }
  return payload;
}

export async function loadOfficialTextbookResources(
  user: User,
  category: TextbookResourceCategoryId,
): Promise<OfficialTextbookResource[]> {
  const payload = await authenticatedRequest<{ items: OfficialTextbookResource[] }>(
    user,
    `/api/textbook-library?category=${encodeURIComponent(category)}`,
  );
  return payload.items;
}

export async function getOfficialTextbookDownloadUrl(user: User, sourceId: string): Promise<string> {
  const payload = await authenticatedRequest<{ url: string }>(
    user,
    `/api/textbook-library?sourceId=${encodeURIComponent(sourceId)}`,
  );
  return payload.url;
}
