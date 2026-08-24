const sourceTypePriority = Object.freeze({
  SUNEUNG_SPECIAL: 4,
  SUNEUNG_COMPLETE: 3,
  TEXTBOOK: 2,
  INTERNAL: 1,
});

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareOptionalTextDescending(left, right) {
  return collator.compare(String(right ?? ""), String(left ?? ""));
}

export function compareConceptRecency(left, right) {
  const yearDifference = (Number(right.publicationYear) || 0) - (Number(left.publicationYear) || 0);
  if (yearDifference) return yearDifference;
  const curriculumDifference = compareOptionalTextDescending(left.curriculumVersion, right.curriculumVersion);
  if (curriculumDifference) return curriculumDifference;
  const editionDifference = compareOptionalTextDescending(left.edition, right.edition);
  if (editionDifference) return editionDifference;
  const updateDifference = timestampMillis(right.updatedAt) - timestampMillis(left.updatedAt);
  if (updateDifference) return updateDifference;
  const sourceDifference = (sourceTypePriority[right.sourceType] || 0) - (sourceTypePriority[left.sourceType] || 0);
  if (sourceDifference) return sourceDifference;
  return String(left.recordId).localeCompare(String(right.recordId), "ko");
}

export function selectLatestConceptRecord(records) {
  return [...(Array.isArray(records) ? records : [])].sort(compareConceptRecency)[0] || null;
}

export function selectLatestConceptRecords(records, conceptKeys) {
  const selected = [];
  for (const conceptKey of conceptKeys) {
    const latest = selectLatestConceptRecord(records.filter((record) => record.conceptKey === conceptKey));
    if (latest) selected.push(latest);
  }
  return selected;
}

