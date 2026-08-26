import type { OfficialExamResource } from "./officialExamResources";
import type { CurriculumResourceRow } from "../types/curriculumResource";

export type CurriculumResourceFeedItem =
  | {
      kind: "official";
      key: string;
      uploadedAtMs: number;
      exam: OfficialExamResource;
    }
  | {
      kind: "manual";
      key: string;
      uploadedAtMs: number;
      row: CurriculumResourceRow;
    };

function dateMs(value: number | string | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || !value.trim()) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildCurriculumResourceFeed(
  manualRows: CurriculumResourceRow[],
  officialRows: OfficialExamResource[],
): CurriculumResourceFeedItem[] {
  return [
    ...manualRows.map((row): CurriculumResourceFeedItem => ({
      kind: "manual",
      key: `manual:${row.id}`,
      uploadedAtMs: dateMs(row.createdAtMs),
      row,
    })),
    ...officialRows.map((exam): CurriculumResourceFeedItem => ({
      kind: "official",
      key: `official:${exam.id}`,
      uploadedAtMs: dateMs(exam.collectedAt),
      exam,
    })),
  ].sort((left, right) => {
    const timestampDifference = right.uploadedAtMs - left.uploadedAtMs;
    if (timestampDifference) return timestampDifference;
    const leftTitle = left.kind === "manual" ? left.row.title : left.exam.title;
    const rightTitle = right.kind === "manual" ? right.row.title : right.exam.title;
    return leftTitle.localeCompare(rightTitle, "ko");
  });
}
