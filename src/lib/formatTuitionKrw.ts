/** 강의실 수강가 표시용 (원, 한국어 천 단위 구분) */
export function formatTuitionKrwWon(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return "—";
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(amount))}원`;
}

export function parseTuitionKrwInput(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1 || n > 99_999_999) return null;
  return Math.round(n);
}
