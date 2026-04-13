/** 승인 시 소개글에 붙는 희망 가격 줄에서 표시용 금액 추출 */
export function extractListedPriceKrw(introduction: string): string | null {
  const m = /\[등록 희망 가격:\s*([\d,]+)원\]/.exec(introduction);
  if (!m) return null;
  return `₩${m[1]}`;
}
