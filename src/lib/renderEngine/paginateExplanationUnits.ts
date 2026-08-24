import type {
  CSATExplanationRenderPage,
  CSATExplanationRenderUnit,
  NormalizedCSATQuestion,
} from "@/lib/renderEngine/types";

export function buildCSATExplanationUnits(
  questions: NormalizedCSATQuestion[],
): CSATExplanationRenderUnit[] {
  return questions.map((question) => ({
    id: `${question.id}-explanation`,
    question,
  }));
}

export function paginateMeasuredCSATExplanationUnits(
  units: CSATExplanationRenderUnit[],
  measuredHeights: ReadonlyMap<string, number>,
  pageCapacity: number,
  unitGap: number,
): CSATExplanationRenderPage[] {
  if (!units.length || pageCapacity <= 0) return [];
  const pages: CSATExplanationRenderPage[] = [];
  let current: CSATExplanationRenderUnit[] = [];
  let usedHeight = 0;

  const flush = () => {
    if (!current.length) return;
    pages.push({ id: `explanations-${pages.length + 1}`, units: current });
    current = [];
    usedHeight = 0;
  };

  units.forEach((unit) => {
    const height = Math.max(1, measuredHeights.get(unit.id) ?? pageCapacity);
    const nextHeight = current.length ? usedHeight + unitGap + height : height;
    if (current.length && nextHeight > pageCapacity) flush();
    current.push(unit);
    usedHeight = current.length === 1 ? height : usedHeight + unitGap + height;
    if (height >= pageCapacity) flush();
  });
  flush();
  return pages;
}
