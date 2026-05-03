/**
 * 업로드한 본문에서 목차 후보 줄을 추출합니다 (휴리스틱).
 */
export function extractTableOfContentsFromText(raw: string, maxEntries = 80): string[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  const lines = text.split("\n").map((l) => l.trim());

  const afterMarker: string[] = [];
  const markerRe = /^(목차|차례|CONTENTS|Table of Contents|TABLE OF CONTENTS)\s*$/i;
  let i = 0;
  for (; i < lines.length; i++) {
    if (markerRe.test(lines[i] ?? "")) {
      i++;
      let blanks = 0;
      for (; i < lines.length && afterMarker.length < maxEntries; i++) {
        const line = lines[i] ?? "";
        if (!line) {
          blanks++;
          if (blanks >= 2 && afterMarker.length > 0) break;
          continue;
        }
        blanks = 0;
        if (line.length > 120) break;
        if (/^\.{3,}/.test(line)) continue;
        afterMarker.push(line);
      }
      break;
    }
  }
  if (afterMarker.length >= 2) return afterMarker.slice(0, maxEntries);

  const candidates: string[] = [];
  const tocLineRe =
    /^(\d+[\.\)]\s+.{2,80}|[\d.]+\s+.{2,80}|제\s*\d+[단원장회차절]?[\s·\-].{1,70}|Part\s+\d+.{0,60}|CHAPTER\s+\d+.{0,60}|Ⅰ\.|Ⅱ\.|•\s+.{2,80})$/i;

  for (const line of lines) {
    if (!line || line.length > 100) continue;
    if (tocLineRe.test(line)) candidates.push(line);
    if (candidates.length >= maxEntries) break;
  }

  const uniq = [...new Set(candidates)];
  return uniq.length >= 2 ? uniq : [];
}
