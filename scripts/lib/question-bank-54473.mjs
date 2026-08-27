import { createHash } from "node:crypto";
import {
  correctVariantQuestion,
  VARIANT_QUESTION_CORRECTION_VERSION,
} from "./variant-question-corrector.mjs";

export const QUESTION_BANK_54473_DATASET_ID = "question-bank-54473-v1";
export const QUESTION_BANK_54473_DATASET_VERSION = "2026-08-27.1";
export const QUESTION_BANK_54473_QUALITY_GATE_VERSION = "source-grounded-import-v1";

const TYPE_BY_NUMBER = Object.freeze({
  1: { internal: "purpose", canonical: "PURPOSE", label: "글의 목적", family: "csat" },
  2: { internal: "emotion_change", canonical: "EMOTION_CHANGE", label: "심경 변화", family: "csat" },
  3: { internal: "claim", canonical: "CLAIM", label: "필자의 주장", family: "csat" },
  4: { internal: "main_idea", canonical: "MAIN_IDEA", label: "글의 요지", family: "csat" },
  5: { internal: "title", canonical: "TITLE", label: "글의 제목", family: "csat" },
  6: { internal: "topic", canonical: "TOPIC", label: "글의 주제", family: "csat" },
  7: { internal: "factual_description", canonical: "FACTUAL_DESCRIPTION", label: "내용 일치", family: "csat" },
  8: { internal: "grammar", canonical: "GRAMMAR", label: "어법", family: "csat" },
  9: { internal: "vocabulary", canonical: "VOCABULARY", label: "어휘", family: "csat" },
  10: { internal: "implied_meaning", canonical: "IMPLIED_MEANING", label: "함축 의미", family: "csat" },
  11: { internal: "blank_short", canonical: "BLANK_SHORT", label: "빈칸 추론 - 단어형", family: "csat" },
  12: { internal: "blank_long", canonical: "BLANK_LONG", label: "빈칸 추론 - 문장형", family: "csat" },
  13: { internal: "irrelevant_sentence", canonical: "IRRELEVANT_SENTENCE", label: "무관한 문장", family: "csat" },
  14: { internal: "paragraph_order", canonical: "PARAGRAPH_ORDER", label: "글의 순서", family: "csat" },
  15: { internal: "sentence_insertion", canonical: "SENTENCE_INSERTION", label: "문장 삽입", family: "csat" },
  16: { internal: "summary", canonical: "SUMMARY", label: "요약문 완성", family: "csat" },
  17: { internal: "writing_reorder", canonical: "WRITING_REORDER", label: "어구 배열", family: "school_writing" },
  18: { internal: "writing_conditional", canonical: "WRITING_CONDITIONAL", label: "조건 영작", family: "school_writing" },
  19: { internal: "grammar_correction", canonical: "GRAMMAR_CORRECTION", label: "어법 오류 수정", family: "school_writing" },
});

function text(value, maxLength = 100_000) {
  return String(value ?? "")
    .replace(/\u0000/gu, " ")
    .replace(/[\t\r\n]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function comparable(value) {
  return text(value, 200_000)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function questionNumber(raw) {
  const fromCode = Number(String(raw?.type_code || "").match(/^\d{1,2}/u)?.[0]);
  if (fromCode >= 1 && fromCode <= 19) return fromCode;
  const fromId = Number(String(raw?.question_id || "").match(/::(\d{1,2})_/u)?.[1]);
  return fromId >= 1 && fromId <= 19 ? fromId : 0;
}

function gradeNumber(value) {
  const grade = Number(String(value || "").match(/[1-3]/u)?.[0]);
  return grade >= 1 && grade <= 3 ? grade + 9 : 12;
}

function unique(values) {
  return [...new Set(values.map((value) => text(value, 120).toLowerCase()).filter(Boolean))];
}

function sourceHashMatches(source) {
  return Boolean(source?.text_sha256)
    && sha256(text(source.text, 100_000)) === text(source.text_sha256, 80).toLowerCase();
}

function sameAnswer(raw, answerRow) {
  if (!answerRow) return false;
  const rawNumber = raw.answer_number == null ? "" : String(raw.answer_number);
  const tableNumber = answerRow.answer_number == null ? "" : String(answerRow.answer_number);
  return rawNumber === tableNumber
    && comparable(raw.answer) === comparable(answerRow.answer)
    && text(raw.source_text_sha256, 80).toLowerCase() === text(answerRow.source_text_sha256, 80).toLowerCase();
}

function sameIndex(raw, indexRow) {
  if (!indexRow) return false;
  return text(raw.passage_id, 160) === text(indexRow.passage_id, 160)
    && text(raw.type_code, 80) === text(indexRow.type_code, 80)
    && text(raw.source_text_sha256, 80).toLowerCase() === text(indexRow.source_text_sha256, 80).toLowerCase();
}

function correctionDiff(raw, corrected) {
  const originalQuestion = [raw.prompt, raw.problem_display].map((item) => text(item, 20_000)).filter(Boolean).join("\n");
  const originalChoices = Array.isArray(raw.options) ? raw.options.map((item) => text(item, 8_000)) : [];
  const correctedAnswer = typeof corrected.answer === "number"
    ? corrected.choices[corrected.answer - 1]
    : corrected.answer;
  return {
    stemRebuilt: comparable(originalQuestion) !== comparable(corrected.stem),
    choicesRebuilt: comparable(originalChoices.join("\n")) !== comparable(corrected.choices.join("\n")),
    answerRebuilt: comparable(raw.answer) !== comparable(correctedAnswer),
    explanationExpanded: comparable(raw.explanation) !== comparable(corrected.explanation),
    displayPassageTransformed: comparable(corrected.passage) !== comparable(corrected.sourcePassage),
  };
}

function rawPayload(raw) {
  return {
    prompt: text(raw.prompt, 4_000),
    problemDisplay: text(raw.problem_display, 20_000),
    options: Array.isArray(raw.options) ? raw.options.map((item) => text(item, 4_000)).slice(0, 8) : [],
    answer: typeof raw.answer === "number" ? raw.answer : text(raw.answer, 4_000),
    answerNumber: raw.answer_number == null ? null : Number(raw.answer_number),
    explanation: text(raw.explanation, 4_000),
    generationMethod: text(raw.generation_method, 300),
  };
}

function baseRecord(raw, source, type, integrity) {
  const questionId = text(raw.question_id, 160);
  const sourceId = `qb54473_${text(raw.passage_id, 160)}`.replace(/[^A-Za-z0-9_-]/gu, "_");
  return {
    questionId,
    subject: "english",
    language: "en",
    examFamily: type.family,
    grade: gradeNumber(raw.grade || source.grade),
    questionType: type.internal,
    canonicalQuestionType: type.canonical,
    subtype: type.label,
    difficulty: gradeNumber(raw.grade || source.grade) === 10 ? 2 : gradeNumber(raw.grade || source.grade) === 11 ? 3 : 4,
    sourceId,
    sourcePassageId: text(raw.passage_id, 160),
    sourceTextSha256: text(source.text_sha256, 80).toLowerCase(),
    conceptTags: unique([type.canonical, type.internal, ...(source.keywords || []).slice(0, 10)]),
    skillTags: unique([type.internal, "source-grounded", "variant-problem", `grade-${gradeNumber(raw.grade || source.grade) - 9}`]),
    datasetId: QUESTION_BANK_54473_DATASET_ID,
    datasetVersion: QUESTION_BANK_54473_DATASET_VERSION,
    sourceArchiveId: QUESTION_BANK_54473_DATASET_ID,
    sourceQuestionId: questionId,
    rawOriginal: rawPayload(raw),
    integrity,
    usageCount: 0,
    visibility: "server_only",
    rightsStatus: "private_internal_reference",
    createdAt: new Date("2026-08-27T00:00:00.000Z"),
    updatedAt: new Date(),
  };
}

export function buildQuestionBank54473Record({ raw, source, answerRow, indexRow }) {
  const number = questionNumber(raw);
  const type = TYPE_BY_NUMBER[number];
  const integrity = {
    questionIdPresent: Boolean(text(raw?.question_id, 160)),
    typeSupported: Boolean(type),
    sourcePresent: Boolean(source?.text),
    sourceHashMatches: sourceHashMatches(source),
    questionSourceHashMatches: text(raw?.source_text_sha256, 80).toLowerCase() === text(source?.text_sha256, 80).toLowerCase(),
    answerTableMatches: sameAnswer(raw, answerRow),
    indexMatches: sameIndex(raw, indexRow),
  };
  const integrityPassed = Object.values(integrity).every(Boolean);
  const fallbackType = type || {
    internal: "unsupported",
    canonical: text(raw?.type_code, 80).toUpperCase() || "UNSUPPORTED",
    label: text(raw?.type, 100) || "미지원 유형",
    family: "school_writing",
  };
  const base = baseRecord(raw, source || {}, fallbackType, integrity);
  if (!integrityPassed || !type) {
    const issues = Object.entries(integrity).filter(([, passed]) => !passed).map(([issue]) => issue);
    return {
      ...base,
      passage: text(source?.text, 30_000),
      question: [raw?.prompt, raw?.problem_display].map((item) => text(item, 20_000)).filter(Boolean).join("\n"),
      choices: Array.isArray(raw?.options) ? raw.options.map((item) => text(item, 4_000)).slice(0, 8) : [],
      answer: raw?.answer_number == null ? text(raw?.answer, 4_000) : Number(raw.answer_number),
      explanation: text(raw?.explanation, 8_000),
      status: "needs_review",
      policyStatus: "needs_review",
      qualityScore: 0,
      validation: {
        valid: false,
        qualityGateVersion: QUESTION_BANK_54473_QUALITY_GATE_VERSION,
        issues,
      },
      generator: { provider: "archive-import", model: "integrity-gate", version: QUESTION_BANK_54473_DATASET_VERSION },
    };
  }

  try {
    const corrected = correctVariantQuestion({
      questionId: base.questionId,
      sourceId: base.sourceId,
      sourcePassageId: base.sourcePassageId,
      questionType: type.internal,
      sourcePassage: source.text,
      question: [raw.prompt, raw.problem_display].map((item) => text(item, 20_000)).filter(Boolean).join("\n"),
      choices: Array.isArray(raw.options) ? raw.options : [],
      answer: number <= 16 ? Number(raw.answer_number) : text(raw.answer, 4_000),
      difficulty: base.difficulty,
    }, {
      typeLabel: type.label,
      difficulty: base.difficulty,
    });
    const answer = typeof corrected.answer === "number" ? corrected.answer : text(corrected.answer, 4_000);
    const policyPassed = !/정답\s*신뢰도|자동\s*대조|AI\s*생성|모델\s*검증/iu.test(corrected.explanation);
    const validationPassed = corrected.validation?.valid === true && policyPassed;
    return {
      ...base,
      passage: corrected.passage,
      question: corrected.stem,
      choices: corrected.choices,
      answer,
      explanation: corrected.explanation,
      choiceRationales: corrected.choiceRationales,
      evidence: {
        supportingSentence: corrected.evidence,
        reasoning: corrected.explanation,
      },
      transformation: corrected.transformation,
      corrections: correctionDiff(raw, corrected),
      contentFingerprint: sha256([
        comparable(corrected.passage),
        comparable(corrected.stem),
        ...corrected.choices.map(comparable),
        comparable(answer),
      ].join("\n")),
      status: validationPassed ? "approved" : "needs_review",
      policyStatus: policyPassed ? "approved" : "needs_review",
      qualityScore: validationPassed ? (type.family === "csat" ? 96 : 93) : 0,
      validation: {
        valid: validationPassed,
        sourceGrounded: true,
        uniqueAnswer: type.family !== "csat" || Number.isInteger(answer),
        policyPassed,
        qualityGateVersion: QUESTION_BANK_54473_QUALITY_GATE_VERSION,
        correctionVersion: VARIANT_QUESTION_CORRECTION_VERSION,
        issues: validationPassed ? [] : ["policy_gate_failed"],
      },
      reusePolicy: type.family === "csat"
        ? ["textbook-structure-reference", "exam-exact"]
        : ["exam-exact"],
      generator: {
        provider: "deterministic-source-corrector",
        model: VARIANT_QUESTION_CORRECTION_VERSION,
        version: QUESTION_BANK_54473_DATASET_VERSION,
      },
    };
  } catch (error) {
    return {
      ...base,
      passage: text(source.text, 30_000),
      question: [raw.prompt, raw.problem_display].map((item) => text(item, 20_000)).filter(Boolean).join("\n"),
      choices: Array.isArray(raw.options) ? raw.options.map((item) => text(item, 4_000)).slice(0, 8) : [],
      answer: raw.answer_number == null ? text(raw.answer, 4_000) : Number(raw.answer_number),
      explanation: text(raw.explanation, 8_000),
      status: "needs_review",
      policyStatus: "needs_review",
      qualityScore: 0,
      validation: {
        valid: false,
        sourceGrounded: false,
        policyPassed: false,
        qualityGateVersion: QUESTION_BANK_54473_QUALITY_GATE_VERSION,
        correctionVersion: VARIANT_QUESTION_CORRECTION_VERSION,
        issues: [text(error instanceof Error ? error.message : error, 1_000)],
      },
      generator: {
        provider: "archive-import",
        model: "correction-failed",
        version: QUESTION_BANK_54473_DATASET_VERSION,
      },
    };
  }
}

export function buildQuestionBank54473Source(source) {
  const sourceId = `qb54473_${text(source.passage_id, 160)}`.replace(/[^A-Za-z0-9_-]/gu, "_");
  return {
    sourceId,
    passageId: text(source.passage_id, 160),
    title: `${text(source.collection, 300)} · ${text(source.passage_id, 160)}`,
    sourceType: "private_english_reference",
    subject: "english",
    grade: gradeNumber(source.grade),
    text: text(source.text, 30_000),
    textSha256: text(source.text_sha256, 80).toLowerCase(),
    sentenceCount: Number(source.sentence_count) || 0,
    keywords: unique(source.keywords || []),
    collection: text(source.collection, 300),
    attachedSourceFile: text(source.attached_source_file, 500),
    sourceLocation: text(source.source_location, 120),
    verificationStatus: text(source.verification_status, 120),
    verificationSource: text(source.verification_source, 500),
    datasetId: QUESTION_BANK_54473_DATASET_ID,
    datasetVersion: QUESTION_BANK_54473_DATASET_VERSION,
    status: sourceHashMatches(source) ? "ready" : "needs_review",
    visibility: "server_only",
    rightsStatus: "private_internal_reference",
    createdAt: new Date("2026-08-27T00:00:00.000Z"),
    updatedAt: new Date(),
  };
}

export function summarizeQuestionBank54473(records) {
  const summary = {
    total: 0,
    approved: 0,
    needsReview: 0,
    byGrade: {},
    byType: {},
    issueCounts: {},
  };
  for (const record of records) {
    summary.total += 1;
    if (record.status === "approved") summary.approved += 1;
    else summary.needsReview += 1;
    const grade = String(record.grade || "unknown");
    summary.byGrade[grade] = (summary.byGrade[grade] || 0) + 1;
    summary.byType[record.questionType] = (summary.byType[record.questionType] || 0) + 1;
    for (const issue of record.validation?.issues || []) {
      const normalized = text(issue, 240);
      summary.issueCounts[normalized] = (summary.issueCounts[normalized] || 0) + 1;
    }
  }
  return summary;
}

export function questionBank54473DocumentId(questionId) {
  return `problem_${sha256(`problem:${text(questionId, 200)}`).slice(0, 32)}`;
}
