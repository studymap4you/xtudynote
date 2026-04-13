/** 카드·상세 표시용: 소개 안의 희망가격 줄 제거(가격은 별도 표기) */
export function stripListedPriceLine(introduction: string): string {
  return introduction
    .split("\n")
    .filter((line) => !/\[등록 희망 가격:\s*[\d,]+원\]/.test(line.trim()))
    .join("\n")
    .trim();
}
