/** 교재 본문·인쇄 등 표시 순서 (unitIndex 기준 퍼뮤테이션) */
export function orderUnitsForBook<T extends { unitIndex: number }>(
  units: T[],
  displayOrder: number[] | null | undefined,
): T[] {
  const rows = [...units];
  if (!displayOrder?.length || displayOrder.length !== rows.length) {
    return rows.sort((a, b) => a.unitIndex - b.unitIndex);
  }
  const idxs = new Set(rows.map((r) => r.unitIndex));
  for (const x of displayOrder) {
    if (!idxs.has(x)) {
      return rows.sort((a, b) => a.unitIndex - b.unitIndex);
    }
  }
  if (new Set(displayOrder).size !== rows.length) {
    return rows.sort((a, b) => a.unitIndex - b.unitIndex);
  }
  const byIndex = new Map(rows.map((r) => [r.unitIndex, r]));
  return displayOrder.map((i) => byIndex.get(i)!).filter(Boolean);
}

export function defaultUnitDisplayOrder(totalUnits: number): number[] {
  return Array.from({ length: totalUnits }, (_, i) => i);
}
