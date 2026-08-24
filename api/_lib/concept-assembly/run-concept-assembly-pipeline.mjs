import { allowedConceptContent } from "./concept-repository.mjs";
import { deduplicateConceptBlocks } from "./deduplicate-concept-blocks.mjs";
import { resolveConceptKeys } from "./resolve-concept-keys.mjs";
import { selectLatestConceptRecords } from "./select-latest-concept-record.mjs";
import { sortConceptBlocks } from "./sort-concept-blocks.mjs";
import { assertConceptIntegrity, conceptContentHash } from "./validate-concept-integrity.mjs";

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}

function toRetrievedBlock(record, rights) {
  const content = rights.content;
  const contentHash = conceptContentHash(content);
  return {
    recordId: record.recordId,
    conceptKey: record.conceptKey,
    title: record.title || record.conceptKey,
    content,
    sequence: record.sequence,
    contentHash,
    integrity: "verified",
    allowedUse: rights.allowedUse,
    source: {
      sourceType: record.sourceType,
      sourceTitle: record.sourceTitle,
      publicationYear: record.publicationYear,
      edition: record.edition,
      curriculumVersion: record.curriculumVersion,
      unit: record.unit,
      chapter: record.chapter,
      section: record.section,
      page: record.page,
    },
  };
}

function emptyResult(conceptKeys) {
  const section = {
    type: "concept",
    blocks: [],
    metadata: {
      conceptCount: 0,
      missingConceptKeys: conceptKeys,
      sourceTitles: [],
      sourceYears: [],
    },
  };
  return { status: "missing", section, missingConceptKeys: conceptKeys };
}

export async function runConceptAssemblyPipeline({
  repository,
  questionTypes,
  subject = "English",
  targetGrade = "",
  isSuperAdmin = false,
}) {
  const normalizedQuestionTypes = unique(
    (Array.isArray(questionTypes) ? questionTypes : []).map((item) => String(item ?? "").trim().toUpperCase()),
  );
  const conceptKeys = resolveConceptKeys(normalizedQuestionTypes);
  if (!conceptKeys.length) return emptyResult([]);

  const records = await repository.search({
    conceptKeys,
    subject,
    targetGrade,
    questionTypes: normalizedQuestionTypes,
  });
  const rightsClearedRecords = records
    .map((record) => ({ record, rights: allowedConceptContent(record, { isSuperAdmin }) }))
    .filter((item) => item.rights)
    .map(({ record, rights }) => ({ ...record, resolvedRights: rights }));
  const latest = selectLatestConceptRecords(rightsClearedRecords, conceptKeys);
  const blocks = sortConceptBlocks(
    deduplicateConceptBlocks(latest.map((record) => toRetrievedBlock(record, record.resolvedRights))),
    conceptKeys,
  );
  assertConceptIntegrity(blocks);

  const resolvedKeys = new Set(blocks.map((block) => block.conceptKey));
  const missingConceptKeys = conceptKeys.filter((conceptKey) => !resolvedKeys.has(conceptKey));
  const section = {
    type: "concept",
    blocks,
    metadata: {
      conceptCount: blocks.length,
      missingConceptKeys,
      sourceTitles: unique(blocks.map((block) => block.source.sourceTitle)),
      sourceYears: unique(blocks.map((block) => block.source.publicationYear).filter((year) => year > 0)),
    },
  };
  return {
    status: blocks.length === 0 ? "missing" : missingConceptKeys.length ? "partial" : "ready",
    section,
    missingConceptKeys,
  };
}

