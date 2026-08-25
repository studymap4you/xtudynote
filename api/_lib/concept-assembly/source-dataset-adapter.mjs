import { createHash } from "node:crypto";
import { conceptMappingRegistry } from "./concept-mapping-registry.mjs";

export const CONCEPT_SOURCE_DATABASE_VERSION = "xstudy-concept-assembly-source-v1";
export const CONCEPT_SOURCE_TITLE = "Xstudy Concept Assembly Source v1";

const QUESTION_TYPE_ORDER = Object.freeze([
  "PURPOSE",
  "EMOTION_CHANGE",
  "IMPLIED_MEANING",
  "MAIN_IDEA",
  "CLAIM",
  "TOPIC",
  "TITLE",
  "CHART",
  "FACTUAL_DESCRIPTION",
  "FACTUAL_PRACTICAL",
  "GRAMMAR",
  "VOCABULARY",
  "BLANK_SHORT",
  "BLANK_LONG",
  "IRRELEVANT_SENTENCE",
  "PARAGRAPH_ORDER",
  "SENTENCE_INSERTION",
  "SUMMARY",
  "LONG_READING_1",
  "LONG_READING_2",
]);

const CONCEPT_KEY_LABELS = Object.freeze({
  purpose_identification: "필자·독자 관계와 글의 목적",
  emotion_change_detection: "상황 변화와 심경 변화",
  implied_meaning: "함축 표현의 문맥상 의미",
  contextual_inference: "전체 맥락에 근거한 추론",
  main_idea_detection: "글의 중심 생각",
  key_sentence_detection: "핵심 문장 식별",
  claim_detection: "필자의 핵심 주장",
  argument_structure: "주장을 뒷받침하는 논리 구조",
  topic_detection: "중심 소재와 주제",
  title_inference: "중심 내용을 포괄하는 제목",
  data_interpretation: "도표 수치와 진술의 대응",
  detail_verification: "세부 정보의 일치 여부",
  practical_text_reading: "실용문의 목적과 세부 정보",
  grammar_strategy: "문맥과 문장 구조를 결합한 어법 판단",
  contextual_vocabulary: "문맥에 맞는 어휘 판단",
  blank_strategy: "빈칸 전후의 논리적 단서",
  logical_relation: "문장과 문단 사이의 논리 관계",
  main_argument_detection: "중심 논지와 빈칸의 연결",
  discourse_coherence: "담화의 일관된 흐름",
  topic_consistency: "문장과 중심 주제의 관련성",
  paragraph_cohesion: "문단 사이의 결속 관계",
  reference_words: "지시어와 대명사의 선행 관계",
  logical_sequence: "글 전개의 논리적 순서",
  sentence_connection: "삽입 문장과 앞뒤 문장의 연결",
  reference_cohesion: "참조 표현을 통한 문장 결속",
  logical_flow: "문단의 논리적 흐름",
  summary_structure: "요약문의 구조",
  core_relation_detection: "핵심 개념 사이의 관계",
  long_reading_structure: "장문의 전체 구조",
  narrative_flow: "서사 전개와 사건 흐름",
});

function cleanText(value, maxLength = 20_000) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, maxLength) : "";
}

function cleanList(value, maxItems = 100, maxLength = 240) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function safeId(value) {
  return cleanText(value, 240).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function contentHash(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function parseQuestionTypeNumber(conceptId) {
  const match = cleanText(conceptId, 100).match(/csat_reading_type_(\d{2})$/);
  return match ? Number(match[1]) : 0;
}

function normalizeStrategySteps(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => ({
      step: Number.isInteger(Number(item?.step)) ? Number(item.step) : index + 1,
      text: cleanText(item?.text, 2_000),
    }))
    .filter((item) => item.text)
    .sort((left, right) => left.step - right.step);
}

function normalizeSourceRefs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    book: cleanText(item?.book, 500),
    section: cleanText(item?.section, 500),
    page: Number(item?.page) || 0,
    kind: cleanText(item?.kind, 160),
  })).filter((item) => item.book && item.kind);
}

function normalizeCoreRecord(raw) {
  const conceptId = cleanText(raw?.concept_id, 100);
  const typeNumber = parseQuestionTypeNumber(conceptId);
  const questionType = QUESTION_TYPE_ORDER[typeNumber - 1] || "";
  const title = cleanText(raw?.title, 500);
  const definition = cleanText(raw?.assembly_ready?.definition, 4_000);
  const strategySteps = normalizeStrategySteps(raw?.assembly_ready?.strategy_steps);
  const conceptKeys = [...(conceptMappingRegistry[questionType] || [])];
  if (!conceptId || !questionType || !title || strategySteps.length === 0 || conceptKeys.length === 0) {
    throw new Error(`Invalid core concept record: ${conceptId || "missing-id"}`);
  }
  return {
    conceptId,
    typeNumber,
    questionType,
    conceptKeys,
    title,
    definition,
    strategySteps,
    sourceRefs: normalizeSourceRefs(raw?.source_refs),
    normalizationNote: cleanText(raw?.normalization_note, 2_000),
  };
}

function normalizeSyntaxRecord(raw) {
  const conceptId = cleanText(raw?.concept_id, 100);
  const match = conceptId.match(/syntax_explanation_(\d{3})$/);
  const content = cleanText(raw?.source_extract, 60_000);
  if (!match || !content) throw new Error(`Invalid syntax explanation record: ${conceptId || "missing-id"}`);
  return {
    conceptId,
    sequence: Number(match[1]),
    content,
    tags: cleanList(raw?.tags, 40, 120),
    sourceRef: {
      book: cleanText(raw?.source_ref?.book, 500),
      startPage: Number(raw?.source_ref?.start_page) || 0,
      endPage: Number(raw?.source_ref?.end_page) || 0,
      kind: cleanText(raw?.source_ref?.kind, 160),
    },
  };
}

function assertUnique(records, key, label) {
  const values = records.map((record) => record[key]);
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} identifiers`);
}

function syntaxTagSummary(records, maxItems = 20) {
  const frequencies = new Map();
  records.forEach((record) => record.tags.forEach((tag) => frequencies.set(tag, (frequencies.get(tag) || 0) + 1)));
  return [...frequencies.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"))
    .slice(0, maxItems)
    .map(([tag, count]) => ({ tag, count }));
}

function buildConceptContent(core, conceptKey, syntaxTags) {
  const parts = [core.title, `개념 초점: ${CONCEPT_KEY_LABELS[conceptKey] || conceptKey}`];
  if (core.definition) parts.push(`유형 개념\n${core.definition}`);
  parts.push(`풀이 절차\n${core.strategySteps.map((item, index) => `${index + 1}. ${item.text}`).join("\n")}`);
  if (core.questionType === "GRAMMAR" && syntaxTags.length) {
    parts.push(
      `구문 설명 검색 범위\n${syntaxTags.map((item) => `${item.tag}(${item.count})`).join(" · ")}\n구문 원문은 concept_syntax_records에서 필요한 범주만 검색해 참고한다.`,
    );
  }
  return parts.join("\n\n");
}

export function parseJsonLines(source, label = "JSONL") {
  return String(source ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${label} line ${index + 1} is not valid JSON: ${error instanceof Error ? error.message : error}`);
      }
    });
}

export function normalizeConceptSourceDataset({ manifest, coreRecords, syntaxRecords }) {
  if (cleanText(manifest?.version, 40) !== "1.0") throw new Error("Unsupported concept source version");
  const core = (Array.isArray(coreRecords) ? coreRecords : []).map(normalizeCoreRecord).sort((a, b) => a.typeNumber - b.typeNumber);
  const syntax = (Array.isArray(syntaxRecords) ? syntaxRecords : []).map(normalizeSyntaxRecord).sort((a, b) => a.sequence - b.sequence);
  const expectedCore = Number(manifest?.core_type_concepts) || 0;
  const expectedSyntax = Number(manifest?.syntax_explanation_blocks) || 0;
  if (core.length !== expectedCore || expectedCore !== QUESTION_TYPE_ORDER.length) {
    throw new Error(`Expected ${QUESTION_TYPE_ORDER.length} core concepts, found ${core.length}`);
  }
  if (syntax.length !== expectedSyntax || expectedSyntax !== 200) {
    throw new Error(`Expected 200 syntax explanations, found ${syntax.length}`);
  }
  assertUnique(core, "conceptId", "core concept");
  assertUnique(syntax, "conceptId", "syntax concept");
  core.forEach((record, index) => {
    if (record.typeNumber !== index + 1) throw new Error(`Missing core concept number ${index + 1}`);
  });
  syntax.forEach((record, index) => {
    if (record.sequence !== index + 1) throw new Error(`Missing syntax explanation number ${index + 1}`);
  });
  return { core, syntax, syntaxTags: syntaxTagSummary(syntax) };
}

export function buildConceptRecordDocuments({ dataset, datasetFingerprint, importedAt = new Date() }) {
  const syntaxTags = dataset.syntaxTags.slice(0, 12);
  return dataset.core.flatMap((core) => {
    const conceptKeys = core.conceptKeys;
    if (!conceptKeys.length) throw new Error(`No concept mapping for ${core.questionType}`);
    const sourceYears = core.sourceRefs.map((ref) => Number(ref.book.match(/20\d{2}/)?.[0]) || 0);
    const publicationYear = Math.max(0, ...sourceYears);
    return conceptKeys.map((conceptKey) => {
      const content = buildConceptContent(core, conceptKey, syntaxTags);
      const recordId = `${CONCEPT_SOURCE_DATABASE_VERSION}-${safeId(core.questionType)}-${safeId(conceptKey)}`;
      return {
        id: recordId,
        data: {
          recordId,
          conceptKey,
          title: `${core.title} · ${CONCEPT_KEY_LABELS[conceptKey] || conceptKey}`,
          content,
          excerptContent: content,
          subject: "English",
          targetGrades: [],
          questionTypes: [core.questionType],
          sourceType: "INTERNAL",
          sourceTitle: CONCEPT_SOURCE_TITLE,
          publicationYear,
          edition: "1.0",
          curriculumVersion: "2022 개정",
          section: core.title,
          page: core.sourceRefs[0]?.page || undefined,
          rightsStatus: "user_supplied_internal_reference",
          allowedUse: "excerpt",
          sourceAccessPolicy: "master_only",
          copyrightPolicy: "internal-derived-concept-excerpt",
          sourceDatabase: "concept_assembly_sources",
          sourceDatabaseVersion: CONCEPT_SOURCE_DATABASE_VERSION,
          sourceConceptId: core.conceptId,
          sourceRefs: core.sourceRefs,
          sourceFingerprint: datasetFingerprint,
          contentFingerprint: contentHash(content),
          normalizationNote: core.normalizationNote,
          syntaxSourceCollection: core.questionType === "GRAMMAR" ? "concept_syntax_records" : undefined,
          syntaxSupportCount: core.questionType === "GRAMMAR" ? dataset.syntax.length : undefined,
          syntaxSupportTags: core.questionType === "GRAMMAR" ? syntaxTags : undefined,
          active: true,
          updatedAt: importedAt,
        },
      };
    });
  });
}

export function buildSyntaxRecordDocuments({ dataset, datasetFingerprint, importedAt = new Date() }) {
  return dataset.syntax.map((record) => ({
    id: `${CONCEPT_SOURCE_DATABASE_VERSION}-${record.conceptId.replaceAll("_", "-")}`,
    data: {
      syntaxId: record.conceptId,
      sequence: record.sequence,
      category: "syntax_explanation",
      content: record.content,
      tags: record.tags,
      searchTerms: [...new Set(["영어", "구문", "어법", ...record.tags])],
      subject: "English",
      targetGrades: ["고3"],
      questionTypes: ["GRAMMAR"],
      sourceTitle: record.sourceRef.book || CONCEPT_SOURCE_TITLE,
      sourceRef: record.sourceRef,
      sourceDatabase: "concept_assembly_sources",
      sourceDatabaseVersion: CONCEPT_SOURCE_DATABASE_VERSION,
      sourceFingerprint: datasetFingerprint,
      contentFingerprint: contentHash(record.content),
      retrievalRole: "concept_assembly_syntax_support",
      rightsStatus: "user_supplied_internal_reference",
      allowedUse: "reference_only",
      sourceAccessPolicy: "master_only",
      copyrightPolicy: "system_reference_only_no_source_republication",
      active: true,
      updatedAt: importedAt,
    },
  }));
}
