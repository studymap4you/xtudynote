#!/usr/bin/env node

/**
 * XUniverse 2027 EBS 변형문제 -> 문제은행 문항 단위 importer.
 *
 * PDF를 사이트 자료로 등록하지 않는다. 생성 단계의 구조화 JSON을 읽어
 * 원문(MASTER) × 변형유형 단위 Firestore problem document로 분해 등록한다.
 *
 * 예시:
 *   node scripts/import-curriculum-variant-json.mjs \
 *     --series=ebs_special_lecture_2027_er_v2 \
 *     --questions=/path/to/integrated_questions.json \
 *     --explanations=/path/to/explanations_1.json,/path/to/explanations_2.json \
 *     --import --verify
 *
 *   node scripts/import-curriculum-variant-json.mjs \
 *     --series=ebs_complete_2027_v2 \
 *     --questions=/path/to/questions.json \
 *     --explanations=/path/to/ExplanationV3.json \
 *     --import --verify
 *
 * 인증은 기존 문제은행 importer와 동일하게 Firebase CLI login을 사용한다.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ID = "xstudy-problem-bank";
const DATASET_VERSION = "2026-09-15.1";
const SERIES = Object.freeze({
  ebs_special_lecture_2027_er_v2: {
    datasetId: "xtudy-2027-ebs-er-variant2",
    category: "ebs_special_lecture",
    title: "2027 EBS 수능특강 영어독해연습 Variant 2",
    expectedConfirmed: 2257,
  },
  ebs_complete_2027_v2: {
    datasetId: "xtudy-2027-ebs-complete-variant2",
    category: "ebs_complete",
    title: "2027 EBS 수능완성 영어 Variant 2",
    expectedConfirmed: 2035,
  },
});

const TYPE_MAP = new Map([
  ["grammar", "grammar"], ["어법", "grammar"],
  ["topic", "topic"], ["주제", "topic"],
  ["title", "title"], ["제목", "title"],
  ["vocabulary", "vocabulary"], ["vocab", "vocabulary"], ["어휘", "vocabulary"], ["문맥상 어울리지 않는 어휘 찾기", "vocabulary"],
  ["implication", "implied_meaning"], ["implied_meaning", "implied_meaning"], ["함축의미", "implied_meaning"], ["함축의미추론", "implied_meaning"], ["함축 의미추론", "implied_meaning"],
  ["summary", "summary"], ["요약", "summary"], ["요약문완성", "summary"], ["요약문 완성", "summary"],
  ["blank", "blank_inference"], ["blank_inference", "blank_inference"], ["빈칸", "blank_inference"], ["빈칸추론", "blank_inference"], ["빈칸 추론", "blank_inference"],
  ["order", "paragraph_order"], ["paragraph_order", "paragraph_order"], ["순서", "paragraph_order"], ["순서배열", "paragraph_order"], ["글의 순서", "paragraph_order"], ["문장의 순서", "paragraph_order"],
  ["insertion", "sentence_insertion"], ["sentence_insertion", "sentence_insertion"], ["문장삽입", "sentence_insertion"], ["문장 삽입", "sentence_insertion"],
  ["irrelevant", "irrelevant_sentence"], ["irrelevant_sentence", "irrelevant_sentence"], ["전체 흐름과 무관한 문장", "irrelevant_sentence"], ["전체 흐름과 관계 없는 문장", "irrelevant_sentence"], ["글의 흐름", "irrelevant_sentence"],
  ["content", "factual_description"], ["factual_description", "factual_description"], ["내용일치", "factual_description"], ["내용 일치", "factual_description"], ["글의 내용과 일치하지 않는 것 선택", "factual_description"],
]);

const TYPE_LABEL = Object.freeze({
  grammar: "어법",
  topic: "주제",
  title: "제목",
  vocabulary: "어휘",
  implied_meaning: "함축 의미추론",
  summary: "요약문 완성",
  blank_inference: "빈칸추론",
  paragraph_order: "문장의 순서",
  sentence_insertion: "문장삽입",
  irrelevant_sentence: "글의 흐름",
  factual_description: "내용일치",
});

const args = new Set(process.argv.slice(2));
const shouldImport = args.has("--import");
const shouldVerify = args.has("--verify");
const shouldReplace = args.has("--replace");

function argumentValue(name, fallback = "") {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function clean(value, max = 100_000) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\u0000/gu, " ")
    .replace(/[\t\r\n]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unwrapQuestions(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.questions,
    payload?.items,
    payload?.problems,
    payload?.data?.questions,
    payload?.result?.questions,
  ];
  return candidates.find(Array.isArray) || [];
}

function unwrapExplanations(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.explanations,
    payload?.items,
    payload?.data?.explanations,
    payload?.result?.explanations,
  ];
  return candidates.find(Array.isArray) || [];
}

function normalizedType(question) {
  const values = [question.type, question.typeName, question.questionType, question.variantType, question.subtype];
  for (const value of values) {
    const raw = clean(value, 100);
    if (!raw) continue;
    const mapped = TYPE_MAP.get(raw) || TYPE_MAP.get(raw.toLowerCase());
    if (mapped) return mapped;
  }
  return "";
}

function questionIdOf(question) {
  return clean(question.questionId || question.id || question.variantId, 200);
}

function canonicalSourceIdOf(question) {
  return clean(
    question.canonicalSourceId
      || question.sourceId
      || question.masterId
      || question.source?.canonicalSourceId
      || question.sourceMetadata?.canonicalSourceId,
    220,
  );
}

function sourceLabelOf(question, canonicalSourceId) {
  return clean(
    question.sourceLabel
      || question.displayLabel
      || question.masterLabel
      || question.source?.sourceLabel
      || question.sourceMetadata?.sourceLabel
      || canonicalSourceId,
    220,
  );
}

function sourcePageOf(question) {
  const candidates = [question.sourcePage, question.page, question.pageNumber, question.source?.page, question.sourceMetadata?.page];
  const value = candidates.map(Number).find((item) => Number.isInteger(item) && item > 0);
  return value || null;
}

function numericParts(value) {
  return (clean(value, 220).match(/\d+/gu) || []).map(Number);
}

function inferredSourceOrder(label) {
  const parts = numericParts(label);
  if (!parts.length) return 999999999;
  return parts.reduce((sum, part) => sum * 1000 + part, 0);
}

function groupForSpecialLecture(question, canonicalSourceId, sourceLabel) {
  const batch = clean(question.batch || question.section || question.unit || question.chapter, 120);
  const regular = canonicalSourceId.match(/EBS-ER-(?:V\d+-)?(\d+)-/iu) || sourceLabel.match(/^(\d+)[강-]/u);
  if (regular) {
    const lesson = Number(regular[1]);
    return { id: `lesson-${String(lesson).padStart(2, "0")}`, label: `${lesson}강`, order: lesson };
  }
  const mini = canonicalSourceId.match(/MINI-?TEST-?(\d+)/iu) || sourceLabel.match(/Mini\s*Test\s*(\d+)/iu) || batch.match(/Mini\s*Test\s*(\d+)/iu);
  if (mini) {
    const number = Number(mini[1]);
    return { id: `mini-test-${number}`, label: `Mini Test ${number}`, order: 100 + number };
  }
  if (batch) return { id: `section-${sha256(batch).slice(0, 10)}`, label: batch, order: inferredSourceOrder(batch) };
  return { id: "other", label: "기타", order: 999 };
}

function groupForComplete(question, sourceLabel) {
  const batch = clean(question.batch || question.section || question.unit || question.chapter, 160);
  const combined = `${batch} ${sourceLabel}`;
  const chapter = combined.match(/Chapter\s*0?(\d+)/iu);
  if (chapter) {
    const number = Number(chapter[1]);
    return { id: `chapter-${String(number).padStart(2, "0")}`, label: `Chapter ${String(number).padStart(2, "0")}`, order: number };
  }
  const mock = combined.match(/실전\s*모의고사\s*(\d+)회/u);
  if (mock) {
    const number = Number(mock[1]);
    return { id: `mock-${number}`, label: `실전 모의고사 ${number}회`, order: 100 + number };
  }
  if (batch) return { id: `section-${sha256(batch).slice(0, 10)}`, label: batch, order: inferredSourceOrder(batch) };
  return { id: "other", label: "기타", order: 999 };
}

function groupInfo(seriesId, question, canonicalSourceId, sourceLabel) {
  return seriesId === "ebs_special_lecture_2027_er_v2"
    ? groupForSpecialLecture(question, canonicalSourceId, sourceLabel)
    : groupForComplete(question, sourceLabel);
}

function normalizeChoices(raw) {
  return asArray(raw).map((choice) => {
    if (typeof choice === "string") return clean(choice, 8_000);
    if (choice && typeof choice === "object") {
      return clean(choice.text ?? choice.label ?? choice.value ?? choice.choice, 8_000);
    }
    return clean(choice, 8_000);
  }).filter(Boolean);
}

const CIRCLED = Object.freeze({ "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 });
function normalizeAnswer(question) {
  const candidates = [question.answerPosition, question.answerIndex, question.answer, question.correctAnswerPosition];
  for (const candidate of candidates) {
    if (Number.isInteger(Number(candidate)) && Number(candidate) >= 1 && Number(candidate) <= 5) return Number(candidate);
    const circled = CIRCLED[clean(candidate, 10)];
    if (circled) return circled;
  }
  const correctAnswer = clean(question.correctAnswer, 8_000);
  const choices = normalizeChoices(question.choices || question.options);
  if (correctAnswer && choices.length === 5) {
    const index = choices.findIndex((choice) => choice === correctAnswer);
    if (index >= 0) return index + 1;
  }
  return 0;
}

function normalizeStatus(question) {
  const status = clean(question.status || question.qaStatus || question.stageStatus, 80).toLowerCase();
  const held = Boolean(question.held || question.isHeld || question.unresolved)
    || /hold|held|보류|pending|fail|reject/u.test(status);
  if (held) return "held";
  if (!status || /pass|approved|confirmed|gold|published|stage2_pass|question_pass/u.test(status)) return "approved";
  return "approved";
}

function explanationFor(question, explanationIndex) {
  const id = questionIdOf(question);
  const external = explanationIndex.get(id);
  const direct = clean(
    external?.explanation
      || external?.coreExplanation
      || external?.derivation
      || question.explanation
      || question.rationale
      || question.answerExplanation,
    16_000,
  );
  return direct;
}

function emphasisRangesOf(question) {
  return asArray(question.emphasisRanges).flatMap((range) => {
    if (!range || typeof range !== "object") return [];
    const target = clean(range.target, 20);
    const style = clean(range.style, 20);
    const start = Number(range.start);
    const end = Number(range.end);
    const choiceIndex = range.choiceIndex === undefined ? undefined : Number(range.choiceIndex);
    if (!["passage", "stem", "choice"].includes(target)) return [];
    if (!["bold", "underline"].includes(style)) return [];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return [];
    if (target === "choice" && (!Number.isInteger(choiceIndex) || choiceIndex < 1 || choiceIndex > 5)) return [];
    return [{ target, style, start, end, ...(choiceIndex ? { choiceIndex } : {}) }];
  });
}

function makeProblem(seriesId, config, question, explanationIndex) {
  const questionId = questionIdOf(question);
  const canonicalSourceId = canonicalSourceIdOf(question);
  const sourceLabel = sourceLabelOf(question, canonicalSourceId);
  const type = normalizedType(question);
  const group = groupInfo(seriesId, question, canonicalSourceId, sourceLabel);
  const choices = normalizeChoices(question.choices || question.options);
  const answer = normalizeAnswer(question);
  const passage = clean(question.passage || question.displayPassage || question.variantPassage || question.text, 40_000);
  const stem = clean(question.questionStem || question.question || question.stem || question.prompt, 8_000);
  const sourcePage = sourcePageOf(question);
  const sourceOrder = Number(question.sourceOrder || question.orderInBook || question.sourceMetadata?.sourceOrder) || inferredSourceOrder(sourceLabel);
  const status = normalizeStatus(question);

  if (!questionId) throw new Error(`questionId missing: ${sourceLabel} / ${TYPE_LABEL[type] || type}`);
  if (!canonicalSourceId) throw new Error(`${questionId}: canonicalSourceId missing`);
  if (!type) throw new Error(`${questionId}: unsupported question type '${clean(question.type || question.typeName, 100)}'`);
  if (status === "approved" && choices.length !== 5) throw new Error(`${questionId}: choices=${choices.length}`);
  if (status === "approved" && !answer) throw new Error(`${questionId}: answer missing`);
  if (status === "approved" && passage.length < 40) throw new Error(`${questionId}: passage too short`);

  return {
    questionId,
    subject: "english",
    language: "en",
    examFamily: "ebs_curriculum",
    grade: 12,
    schoolGrade: 3,
    curriculumYear: 2027,
    curriculumCatalog: "high_school",
    curriculumCategory: config.category,
    curriculumSeries: seriesId,
    curriculumSeriesTitle: config.title,
    curriculumGroup: group.id,
    curriculumGroupLabel: group.label,
    curriculumGroupOrder: group.order,
    canonicalSourceId,
    sourceId: canonicalSourceId,
    sourceLabel,
    curriculumSourceOrder: sourceOrder,
    ...(sourcePage ? { sourcePage } : {}),
    masterSha256: clean(question.masterSha256 || question.masterHash || question.sourceMetadata?.masterSha256, 128) || null,
    questionType: type,
    subtype: TYPE_LABEL[type],
    variantType: type,
    variantIndex: Number(question.variantIndex) || 1,
    passage,
    question: stem,
    choices,
    answer,
    explanation: explanationFor(question, explanationIndex),
    emphasisRanges: emphasisRangesOf(question),
    target: question.target ?? null,
    conceptTags: [type, "grade-3", "ebs-2027", config.category],
    skillTags: [type, "curriculum-variant", seriesId],
    qualityScore: status === "approved" ? 98 : 0,
    status,
    validation: {
      answerPresent: Boolean(answer),
      explanationPresent: Boolean(explanationFor(question, explanationIndex)),
      structurallyValid: choices.length === 5 && passage.length >= 40,
      sourceVerified: Boolean(canonicalSourceId),
      parserVersion: DATASET_VERSION,
      originalStatus: clean(question.status || question.qaStatus || question.stageStatus, 100),
    },
    generator: {
      provider: "xtudy-universe",
      model: "pre-generated-variant",
      version: DATASET_VERSION,
    },
    contentFingerprint: sha256(JSON.stringify({ passage, stem, choices, answer, type, canonicalSourceId })),
    datasetId: config.datasetId,
    datasetVersion: DATASET_VERSION,
    importedAt: new Date(),
    updatedAt: new Date(),
  };
}

function firestoreValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue).filter(Boolean) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
      const converted = firestoreValue(child);
      return converted ? [[key, converted]] : [];
    })) } };
  }
  return { stringValue: String(value) };
}

function documentWrite(documentPath, data) {
  return {
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${documentPath}`,
      fields: Object.fromEntries(Object.entries(data).flatMap(([key, value]) => {
        const converted = firestoreValue(value);
        return converted ? [[key, converted]] : [];
      })),
    },
  };
}

async function createCliAccessToken() {
  const require = createRequire(import.meta.url);
  const firebaseAuth = require("/opt/homebrew/lib/node_modules/firebase-tools/lib/auth.js");
  const account = firebaseAuth.getProjectDefaultAccount(process.cwd()) || firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI login is required");
  const token = await firebaseAuth.getAccessToken(account.tokens.refresh_token, [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
  ]);
  if (!token?.access_token) throw new Error("Firebase CLI access token is unavailable");
  return token.access_token;
}

async function commitWrites(accessToken, writes) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    },
  );
  if (!response.ok) throw new Error(`Firestore commit failed (${response.status}): ${(await response.text()).slice(0, 1200)}`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function loadExplanationIndex(paths) {
  const index = new Map();
  for (const filePath of paths) {
    if (!filePath) continue;
    const payload = await readJson(filePath);
    for (const item of unwrapExplanations(payload)) {
      const id = questionIdOf(item);
      if (id) index.set(id, item);
    }
  }
  return index;
}

async function importProblems(problems, replace) {
  const accessToken = await createCliAccessToken();
  let imported = 0;
  for (let index = 0; index < problems.length; index += 150) {
    const batch = problems.slice(index, index + 150).map((problem) => {
      const documentId = `problem_${sha256(problem.questionId).slice(0, 32)}`;
      const write = documentWrite(`problems/${documentId}`, problem);
      if (!replace) {
        write.currentDocument = { exists: false };
      }
      return write;
    });
    if (!replace) {
      // Firestore commit preconditions are per write, not top-level.
      batch.forEach((write) => {
        write.currentDocument = { exists: false };
      });
    }
    try {
      await commitWrites(accessToken, batch);
      imported += batch.length;
    } catch (error) {
      if (!replace && /ALREADY_EXISTS|FAILED_PRECONDITION/u.test(String(error))) {
        // Idempotent behavior: if at least one doc exists, retry this chunk as updates.
        await commitWrites(accessToken, batch.map(({ currentDocument, ...write }) => write));
        imported += batch.length;
      } else {
        throw error;
      }
    }
    console.log(`등록 ${Math.min(index + batch.length, problems.length)}/${problems.length}`);
  }
  return { accessToken, imported };
}

async function countSeries(accessToken, seriesId) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: "problems" }],
        where: { fieldFilter: { field: { fieldPath: "curriculumSeries" }, op: "EQUAL", value: { stringValue: seriesId } } },
        select: { fields: [{ fieldPath: "questionId" }, { fieldPath: "status" }] },
      } }),
    },
  );
  if (!response.ok) throw new Error(`Verify query failed (${response.status}): ${(await response.text()).slice(0, 800)}`);
  const rows = await response.json();
  const docs = rows.filter((row) => row.document?.fields?.questionId);
  const approved = docs.filter((row) => row.document?.fields?.status?.stringValue === "approved").length;
  const held = docs.filter((row) => row.document?.fields?.status?.stringValue === "held").length;
  return { total: docs.length, approved, held };
}

const seriesId = argumentValue("--series");
const config = SERIES[seriesId];
if (!config) throw new Error(`--series must be one of: ${Object.keys(SERIES).join(", ")}`);
const questionPaths = argumentValue("--questions").split(",").map((value) => value.trim()).filter(Boolean);
if (!questionPaths.length) throw new Error("--questions=/path/to/questions.json is required");
const explanationPaths = argumentValue("--explanations").split(",").map((value) => value.trim()).filter(Boolean);
const explanationIndex = await loadExplanationIndex(explanationPaths);

const rawQuestions = [];
for (const filePath of questionPaths) {
  const payload = await readJson(filePath);
  const items = unwrapQuestions(payload);
  if (!items.length) throw new Error(`${filePath}: question array not found`);
  rawQuestions.push(...items);
}

const byId = new Map();
for (const question of rawQuestions) {
  const id = questionIdOf(question);
  if (!id) throw new Error("Question without questionId found");
  if (byId.has(id) && JSON.stringify(byId.get(id)) !== JSON.stringify(question)) {
    throw new Error(`Duplicate questionId with different payload: ${id}`);
  }
  byId.set(id, question);
}

const problems = [...byId.values()].map((question) => makeProblem(seriesId, config, question, explanationIndex));
const approvedProblems = problems.filter((problem) => problem.status === "approved");
const heldProblems = problems.filter((problem) => problem.status === "held");
const sourceIds = new Set(approvedProblems.map((problem) => problem.canonicalSourceId));
const groups = new Set(approvedProblems.map((problem) => problem.curriculumGroup));
const typeCounts = Object.fromEntries(Object.keys(TYPE_LABEL).map((type) => [type, approvedProblems.filter((problem) => problem.questionType === type).length]));

console.log(JSON.stringify({
  seriesId,
  title: config.title,
  rawQuestionCount: rawQuestions.length,
  uniqueQuestionCount: problems.length,
  approvedCount: approvedProblems.length,
  heldCount: heldProblems.length,
  sourceCount: sourceIds.size,
  groupCount: groups.size,
  explanationCount: explanationIndex.size,
  typeCounts,
  expectedConfirmed: config.expectedConfirmed,
}, null, 2));

if (approvedProblems.length !== config.expectedConfirmed) {
  throw new Error(`Confirmed count mismatch: expected ${config.expectedConfirmed}, actual ${approvedProblems.length}`);
}

let live = null;
if (shouldImport) live = await importProblems(problems, shouldReplace);
if (shouldVerify) {
  const accessToken = live?.accessToken || await createCliAccessToken();
  const counts = await countSeries(accessToken, seriesId);
  if (counts.approved !== config.expectedConfirmed) {
    throw new Error(`Verification failed: expected approved=${config.expectedConfirmed}, actual=${counts.approved}`);
  }
  console.log(JSON.stringify({ verified: true, seriesId, ...counts }, null, 2));
}
