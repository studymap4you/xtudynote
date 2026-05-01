/** "4, 5, 9" 형태. 빈 입력이면 empty, 잘못된 토큰이면 invalid */
export type ParseCommaSeparatedPdfPagesResult = "empty" | "invalid" | number[];

export function parseCommaSeparatedPdfPages(raw: string): ParseCommaSeparatedPdfPagesResult {
  const segments = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return "empty";
  const nums: number[] = [];
  for (const seg of segments) {
    const n = Number.parseInt(seg, 10);
    if (!Number.isFinite(n) || n < 1) return "invalid";
    nums.push(Math.floor(n));
  }
  const seen = new Set<number>();
  const deduped: number[] = [];
  for (const n of nums) {
    if (seen.has(n)) continue;
    seen.add(n);
    deduped.push(n);
  }
  return deduped;
}
