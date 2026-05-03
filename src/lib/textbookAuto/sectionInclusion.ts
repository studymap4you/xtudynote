import type { TextbookSectionInclusion, TextbookUnitContent } from "@/types/textbookAuto";
import { DEFAULT_SECTION_INCLUSION } from "@/types/textbookAuto";

const SECTION_KEYS: (keyof TextbookSectionInclusion)[] = [
  "keyConcepts",
  "contentStudy",
  "coreSummary",
  "practice",
  "unitTest",
];

export function parseSectionInclusionFromUnknown(raw: unknown): TextbookSectionInclusion | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const patch: Partial<TextbookSectionInclusion> = {};
  for (const k of SECTION_KEYS) {
    if (typeof o[k] === "boolean") patch[k] = o[k];
  }
  if (Object.keys(patch).length === 0) return undefined;
  return { ...DEFAULT_SECTION_INCLUSION, ...patch };
}

export function getSectionInclusion(unit: TextbookUnitContent): TextbookSectionInclusion {
  return unit.sectionInclusion ? { ...DEFAULT_SECTION_INCLUSION, ...unit.sectionInclusion } : DEFAULT_SECTION_INCLUSION;
}

/** 체크 해제된 섹션은 빈 배열로 두고, 최종 교재·정답 스텁 등에 사용 */
export function applySectionInclusionToUnit(
  unit: TextbookUnitContent,
  inc: TextbookSectionInclusion,
): TextbookUnitContent {
  return {
    ...unit,
    sectionInclusion: inc,
    keyConcepts: inc.keyConcepts ? unit.keyConcepts : [],
    contentStudy: inc.contentStudy ? unit.contentStudy : [],
    coreSummary: inc.coreSummary ? unit.coreSummary : [],
    practice: inc.practice ? unit.practice : [],
    unitTest: inc.unitTest ? unit.unitTest : [],
  };
}

export function unitForStudentOutput(unit: TextbookUnitContent): TextbookUnitContent {
  return applySectionInclusionToUnit(unit, getSectionInclusion(unit));
}

export function mapUnitsForStudentOutput(
  units: { unitIndex: number; unit: TextbookUnitContent }[],
): { unitIndex: number; unit: TextbookUnitContent }[] {
  return units.map(({ unitIndex, unit }) => ({
    unitIndex,
    unit: unitForStudentOutput(unit),
  }));
}

export function anySectionInclusionEnabled(inc: TextbookSectionInclusion): boolean {
  return inc.keyConcepts || inc.contentStudy || inc.coreSummary || inc.practice || inc.unitTest;
}
