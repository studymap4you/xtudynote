import type { TextbookUnitSetupState } from "@/types/textbookAuto";

export function emptyUnitSetup(): TextbookUnitSetupState {
  return { manualText: "", fileSegments: [], pendingFiles: [] };
}

/** 직접 입력 + 추출된 파일 블록을 합친 단원 지문 */
export function combineUnitPassage(u: TextbookUnitSetupState): string {
  const parts: string[] = [];
  const m = u.manualText.trim();
  if (m) parts.push(m);
  for (const seg of u.fileSegments) {
    const t = seg.text.trim();
    if (t) parts.push(t);
  }
  return parts.join("\n\n");
}
