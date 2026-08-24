import type { ConceptRenderPage, ConceptRenderUnit, ConceptSection } from "@/types/conceptAssembly";

const MAX_CONCEPT_CHARS_PER_UNIT = 1_800;

function preferredBoundary(window: string, floor: number): number {
  const candidates = [
    { index: window.lastIndexOf("\n\n"), width: 2 },
    { index: window.lastIndexOf(". "), width: 2 },
    { index: window.lastIndexOf("다. "), width: 3 },
    { index: window.lastIndexOf("\n"), width: 1 },
    { index: window.lastIndexOf(" "), width: 1 },
  ].filter((candidate) => candidate.index >= floor);
  if (!candidates.length) return window.length;
  const selected = candidates.sort((left, right) => right.index - left.index)[0]!;
  return selected.index + selected.width;
}

export function splitConceptContentForRender(source: string, maxChars = MAX_CONCEPT_CHARS_PER_UNIT): string[] {
  if (!source) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (source.length - cursor > maxChars) {
    const window = source.slice(cursor, cursor + maxChars);
    const width = Math.max(1, preferredBoundary(window, Math.floor(maxChars * 0.6)));
    chunks.push(source.slice(cursor, cursor + width));
    cursor += width;
  }
  if (cursor < source.length) chunks.push(source.slice(cursor));
  return chunks;
}

export function buildConceptRenderUnits(section?: ConceptSection): ConceptRenderUnit[] {
  if (!section?.blocks.length) return [];
  return section.blocks.flatMap((block) => {
    const chunks = splitConceptContentForRender(block.content);
    return chunks.map((content, index) => ({
      id: `${block.recordId}-concept-${index + 1}`,
      kind: "concept" as const,
      block,
      content,
      continuation: index > 0,
      showTitle: index === 0,
    }));
  });
}

export function paginateMeasuredConceptUnits(
  units: ConceptRenderUnit[],
  measuredHeights: ReadonlyMap<string, number>,
  pageCapacity: number,
  unitGap: number,
): ConceptRenderPage[] {
  if (!units.length || pageCapacity <= 0) return [];
  const pages: ConceptRenderPage[] = [];
  let current: ConceptRenderUnit[] = [];
  let usedHeight = 0;
  const flush = () => {
    if (!current.length) return;
    pages.push({ id: `concepts-${pages.length + 1}`, units: current });
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

