/** 주관식 — 공백·대소문자 정규화 후 일치 또는 부분 포함 허용 */
export function gradeShortAnswer(userRaw: string, expectedRaw: string): boolean {
  const u = userRaw.trim().replace(/\s+/g, " ").toLowerCase();
  const e = expectedRaw.trim().replace(/\s+/g, " ").toLowerCase();
  if (u.length < 1 || e.length < 1) return false;
  if (u === e) return true;
  if (u.length >= 3 && (e.includes(u) || u.includes(e))) return true;
  return false;
}
