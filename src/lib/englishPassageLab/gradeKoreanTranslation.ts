/** 한국어 해석 채점 — 공백 정규화 후 완전 일치 또는 긴 문장일 때 포함 관계 허용 */
export function gradeKoreanTranslation(userRaw: string, expectedRaw: string): boolean {
  const u = userRaw.trim().replace(/\s+/g, " ");
  const e = expectedRaw.trim().replace(/\s+/g, " ");
  if (!u || !e) return false;
  if (u === e) return true;
  if (u.length >= 6 && e.length >= 6 && (e.includes(u) || u.includes(e))) return true;
  return false;
}
