import type { TextbookSectionInclusion, TextbookUnitContent } from "@/types/textbookAuto";

/** 정답·해설 AI에 넘기는 단원 맥락(핵심개념·요약 등) */
export function formatKeyContextForAnswerKey(
  unit: TextbookUnitContent,
  sectionInclusion: TextbookSectionInclusion,
): string {
  const parts: string[] = [];
  if (sectionInclusion.keyConcepts && unit.keyConcepts.length > 0) {
    const lines = unit.keyConcepts
      .map((k, i) => `${i + 1}. ${k.concept.trim()}: ${k.explanation.trim()}`)
      .filter((s) => s.length > 4);
    if (lines.length) parts.push(`[핵심개념]\n${lines.join("\n")}`);
  }
  if (sectionInclusion.coreSummary) {
    const lines = unit.coreSummary.map((s) => s.trim()).filter(Boolean);
    if (lines.length) parts.push(`[핵심요약]\n${lines.map((s) => `- ${s}`).join("\n")}`);
  }
  if (sectionInclusion.contentStudy && unit.contentStudy.length > 0) {
    const lines = unit.contentStudy.flatMap((b) => {
      const t = b.title.trim();
      if (!t) return [];
      const bs = b.bullets.map((x) => x.trim()).filter(Boolean);
      return [`「${t}」`, ...bs.map((x) => `  · ${x}`)];
    });
    if (lines.length) parts.push(`[내용학습 개요]\n${lines.join("\n")}`);
  }
  return parts.join("\n\n") || "(핵심개념·요약 맥락 없음)";
}
