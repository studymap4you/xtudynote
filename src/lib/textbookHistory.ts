import { auth } from "@/firebase/config";
import type { AcademyTextbookHistoryItem, AcademyTextbookJob } from "@/types/academyTextbook";

async function historyRequest<T>(path = "", init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인 후 교재 기록을 이용할 수 있습니다.");
  const idToken = await user.getIdToken();
  const response = await fetch(`/api/textbook-history${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "교재 기록을 불러오지 못했습니다.");
  return payload;
}

export async function listTextbookHistory(): Promise<AcademyTextbookHistoryItem[]> {
  const payload = await historyRequest<{ items: AcademyTextbookHistoryItem[] }>();
  return payload.items;
}

export async function getTextbookHistoryJob(id: string): Promise<AcademyTextbookJob> {
  const payload = await historyRequest<{ job: AcademyTextbookJob }>(`?id=${encodeURIComponent(id)}`);
  return payload.job;
}

export async function deleteTextbookHistoryJob(id: string): Promise<void> {
  await historyRequest<{ ok: true }>(`?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function updateTextbookHistoryStatus(
  id: string,
  status: "paused" | "failed",
  error?: string,
): Promise<void> {
  await historyRequest<{ ok: true }>(`?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, error }),
  });
}
