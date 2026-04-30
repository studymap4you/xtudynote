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

/** 마켓 상품 카드·모달용 — 유효할 때만 `가격 N원` 문자열 */
export function formatMarketPriceLabelKrw(priceKrw: unknown): string | null {
  if (typeof priceKrw !== "number" || !Number.isFinite(priceKrw) || priceKrw < 1) return null;
  return `가격 ${formatTuitionKrwWon(priceKrw)}`;
}
