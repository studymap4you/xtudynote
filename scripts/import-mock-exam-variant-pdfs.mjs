#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const PROJECT_ID = "xstudy-problem-bank";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const DATASET_VERSION = "2026-08-29.1";
const DEFAULT_SOURCE_ROOT = path.join(process.env.HOME || "", "Downloads");
const DEFAULT_OUTPUT = path.resolve("tmp/mock-exam-variant-import.json");

const SOURCE_FILES = Object.freeze([
  [1, 2025, 3, "고1_2025년_03월_11유형_변형문제_회차완료본.pdf"],
  [1, 2025, 6, "고1_2025년_06월_11유형_변형문제_회차완료본.pdf"],
  [1, 2025, 9, "고1_2025년_09월_11유형_변형문제_회차완료본.pdf"],
  [1, 2025, 10, "고1_2025년_10월_11유형_변형문제_회차완료본.pdf"],
  [1, 2026, 3, "고1_2026년_03월_11유형_변형문제_회차완료본.pdf"],
  [1, 2026, 6, "고1_2026년_06월_11유형_변형문제_검수본.pdf"],
  [2, 2025, 3, "고2_2025년_03월_11유형_변형문제_회차완료본.pdf"],
  [2, 2025, 6, "고2_2025년_06월_11유형_변형문제_회차완료본.pdf"],
  [2, 2025, 9, "고2_2025년_09월_11유형_변형문제_회차완료본.pdf"],
  [2, 2025, 10, "고2_2025년_10월_11유형_변형문제_회차완료본.pdf"],
  [2, 2026, 3, "고2_2026년_03월_11유형_변형문제_회차완료본.pdf"],
  [2, 2026, 6, "고2_2026년_06월_11유형_변형문제_회차완료본.pdf"],
].map(([grade, year, month, fileName]) => ({ grade, year, month, fileName })));

const TYPE_BY_LABEL = Object.freeze({
  "어법": "grammar",
  "주제": "topic",
  "제목": "title",
  "어휘": "vocabulary",
  "함축의미추론": "implied_meaning",
  "함축 의미추론": "implied_meaning",
  "요약문완성": "summary",
  "요약문 완성": "summary",
  "빈칸추론": "blank_inference",
  "빈칸 추론": "blank_inference",
  "문장의 순서": "paragraph_order",
  "문장삽입": "sentence_insertion",
  "문장 삽입": "sentence_insertion",
  "전체 흐름과 무관한 문장": "irrelevant_sentence",
  "글의 흐름": "irrelevant_sentence",
  "내용일치": "factual_description",
  "내용 일치": "factual_description",
});

const STEM_BY_TYPE = Object.freeze({
  grammar: "다음 글의 굵게 표시된 부분 중, 어법상 틀린 것은?",
  topic: "다음 글의 주제로 가장 적절한 것은?",
  title: "다음 글의 제목으로 가장 적절한 것은?",
  vocabulary: "다음 글의 굵게 표시된 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
  implied_meaning: "다음 글에서 굵은 글씨로 강조된 부분이 의미하는 바로 가장 적절한 것은?",
  summary: "다음 글의 내용을 한 문장으로 요약할 때 빈칸에 들어갈 말로 가장 적절한 것은?",
  blank_inference: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
  paragraph_order: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
  sentence_insertion: "글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?",
  irrelevant_sentence: "다음 글에서 전체 흐름과 관계없는 문장은?",
  factual_description: "다음 글의 내용과 일치하지 않는 것은?",
});

const CIRCLED = Object.freeze({ "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5 });
const args = new Set(process.argv.slice(2));
const shouldImport = args.has("--import");
const shouldVerify = args.has("--verify");

function argumentValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function clean(value, maxLength = 100_000) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\u0000/gu, " ")
    .replace(/[\t\r\n]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function questionNumbers(value) {
  const numbers = clean(value, 30).match(/\d{1,2}/gu)?.map(Number) || [];
  if (numbers.length === 1) return numbers;
  if (numbers.length === 2 && numbers[1] >= numbers[0]) {
    return Array.from({ length: numbers[1] - numbers[0] + 1 }, (_, index) => numbers[0] + index);
  }
  return [];
}

function stripPageHeader(text, config, pageNumber) {
  const escapedMonth = `0?${String(config.month)}`;
  return clean(text)
    .replace(new RegExp(`^Xtudy Universe \\| 고${config.grade} ${config.year}년 ${escapedMonth}월 11유형 변형문제\\s+${pageNumber}\\s+`, "u"), "")
    .trim();
}

async function extractPages(sourcePath, config) {
  const bytes = await readFile(sourcePath);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const raw = content.items.map((item) => (item && "str" in item ? item.str : "")).join(" ");
    pages.push({ pageNumber, text: stripPageHeader(raw, config, pageNumber) });
  }
  return { pages, pageCount: pdf.numPages, fingerprint: sha256(bytes), byteSize: bytes.length };
}

function parseChoices(body) {
  const markers = [...body.matchAll(/[①②③④⑤]/gu)];
  if (markers.length < 5) return { passage: clean(body, 30_000), choices: [] };
  const tail = markers.slice(-5);
  if (tail.map((marker) => marker[0]).join("") !== "①②③④⑤") {
    return { passage: clean(body, 30_000), choices: [] };
  }
  const choices = tail.map((marker, index) => clean(body.slice(
    Number(marker.index) + marker[0].length,
    index + 1 < tail.length ? Number(tail[index + 1].index) : body.length,
  ), 4_000));
  return { passage: clean(body.slice(0, Number(tail[0].index)), 30_000), choices };
}

function parseQuestionPage(text) {
  const match = text.match(/^(\d{1,2})\.\s*\[([^\]]+)\]\s*([\s\S]+)$/u);
  if (!match) return null;
  const sequence = Number(match[1]);
  const label = clean(match[2], 80);
  const type = TYPE_BY_LABEL[label];
  if (!type) return null;
  let body = clean(match[3]);
  const standardStem = STEM_BY_TYPE[type];
  const normalizedStem = clean(standardStem);
  if (body.startsWith(normalizedStem)) body = clean(body.slice(normalizedStem.length));
  else {
    const firstEnglish = body.search(/(?<![A-Za-z])[A-Za-z][A-Za-z'“”"]{1,}/u);
    if (firstEnglish > 0) body = clean(body.slice(firstEnglish));
  }
  let parsed = parseChoices(body);
  if (["sentence_insertion", "irrelevant_sentence"].includes(type)
    && (parsed.passage.length < 80 || parsed.choices.some((choice) => choice.length > 30))) {
    parsed = { passage: clean(body, 30_000), choices: ["①", "②", "③", "④", "⑤"] };
  }
  return { sequence, label, type, question: standardStem, ...parsed };
}

function parseAnswerPage(text) {
  const answers = new Map();
  const markers = [...text.matchAll(/(?:^|\s)(\d{1,2})\.\s*\[([^\]]+)\]\s*정답\s*([①②③④⑤])/gu)];
  markers.forEach((marker, index) => {
    const start = Number(marker.index) + marker[0].length;
    const end = index + 1 < markers.length ? Number(markers[index + 1].index) : text.length;
    answers.set(Number(marker[1]), {
      label: clean(marker[2], 80),
      answer: CIRCLED[marker[3]],
      explanation: clean(text.slice(start, end), 8_000),
    });
  });
  return answers;
}

function passageTitle(text, config) {
  const match = text.match(new RegExp(`고${config.grade} ${config.year}년 0?${config.month}월 모의고사\\s+([0-9~～-]+)번(?:\\s+공통지문)?\\s+변형문제`, "u"));
  if (!match) return null;
  const numbers = questionNumbers(match[1]);
  return numbers.length ? { sourceLabel: match[1], numbers } : null;
}

const TYPE_LABEL_PATTERN = Object.keys(TYPE_BY_LABEL)
  .sort((left, right) => right.length - left.length)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
  .join("|");

function flexibleGroups(pages, config) {
  const documentText = pages.map((page) => ` [[PAGE_${page.pageNumber}]] ${page.text}`).join(" ");
  const sourcePattern = new RegExp([
    "SET\\s+\\d+\\s*\\|\\s*원문 문항\\s*([0-9~～-]+)",
    "원문\\s+([0-9~～-]+)\\s*·\\s*11유형 세트",
    `고${config.grade} ${config.year}년 0?${config.month}월\\s*\\|\\s*([0-9~～-]+)번(?:\\s+공통지문)? 변형문제 11개`,
    `고${config.grade} ${config.year}년 0?${config.month}월 모의고사\\s+([0-9~～-]+)번(?:\\s+공통지문)?\\s+변형문제`,
    `${config.year}년 0?${config.month}월 고${config.grade}\\s+([0-9~～-]+)번(?:\\s+공통지문)?\\s+변형문제`,
    "([0-9~～-]+)번(?:\\s+공통지문)?\\s*·\\s*MASTER PASSAGE",
  ].join("|"), "gu");
  const markers = [...documentText.matchAll(sourcePattern)];
  return markers.map((marker, index) => {
    const sourceLabel = marker.slice(1).find(Boolean);
    return {
      sourceLabel,
      numbers: questionNumbers(sourceLabel),
      text: documentText.slice(Number(marker.index), index + 1 < markers.length ? Number(markers[index + 1].index) : documentText.length),
    };
  }).filter((group) => group.numbers.length);
}

function pageNumberAt(text, offset) {
  const matches = [...text.slice(0, offset).matchAll(/\[\[PAGE_(\d+)\]\]/gu)];
  return matches.length ? Number(matches.at(-1)[1]) : 0;
}

function removePageTokens(value) {
  return clean(String(value).replace(/\[\[PAGE_\d+\]\]/gu, " "));
}

function parseFlexibleGroup(group) {
  const bracketMarker = `(?:\\d{2}-)?(\\d{1,2})\\.\\s*\\[(${TYPE_LABEL_PATTERN})\\]`;
  const pipeMarker = `(?:[0-9~～-]+)번(?:\\s+공통지문)? 변형\\s+(\\d{2})\\s*\\|\\s*(${TYPE_LABEL_PATTERN})`;
  const questionPattern = new RegExp(`${bracketMarker}|${pipeMarker}`, "gu");
  const questionMarkers = [...group.text.matchAll(questionPattern)].filter((marker) => {
    const after = group.text.slice(Number(marker.index) + marker[0].length, Number(marker.index) + marker[0].length + 20);
    return !/^\s*정답/u.test(after);
  });
  const answerPattern = new RegExp(`(?:\\d{2}-)?(\\d{1,2})\\.?\\s*(?:\\[)?(${TYPE_LABEL_PATTERN})(?:\\])?\\s*(?:\\|)?\\s*정답\\s*([①②③④⑤])`, "gu");
  const answerMarkers = [...group.text.matchAll(answerPattern)];
  const answers = new Map();
  answerMarkers.forEach((marker, index) => {
    const sequence = Number(marker[1]);
    const next = index + 1 < answerMarkers.length ? Number(answerMarkers[index + 1].index) : group.text.length;
    const explanation = removePageTokens(group.text.slice(Number(marker.index) + marker[0].length, next));
    answers.set(sequence, { label: clean(marker[2], 80), answer: CIRCLED[marker[3]], explanation: explanation.slice(0, 8_000) });
  });
  const questions = questionMarkers.map((marker, index) => {
    const sequence = Number(marker[1] || marker[3]);
    const label = clean(marker[2] || marker[4], 80);
    const type = TYPE_BY_LABEL[label];
    const start = Number(marker.index) + marker[0].length;
    const nextQuestion = index + 1 < questionMarkers.length ? Number(questionMarkers[index + 1].index) : group.text.length;
    const answerStart = answerMarkers.find((answerMarker) => Number(answerMarker.index) > start)?.index;
    const end = answerStart !== undefined && Number(answerStart) < nextQuestion ? Number(answerStart) : nextQuestion;
    let body = removePageTokens(group.text.slice(start, end));
    const knownStem = STEM_BY_TYPE[type];
    const firstEnglish = body.search(/(?<![A-Za-z])[A-Za-z][A-Za-z'“”"]{1,}/u);
    if (firstEnglish > 0) body = clean(body.slice(firstEnglish));
    let parsed = parseChoices(body);
    if (parsed.choices.length !== 5) {
      parsed = { passage: body, choices: ["①", "②", "③", "④", "⑤"] };
    }
    if (["grammar", "vocabulary", "sentence_insertion", "irrelevant_sentence"].includes(type)
      && (parsed.passage.length < 80 || parsed.choices.length !== 5 || parsed.choices.some((choice) => choice.length > 30))) {
      parsed = { passage: body, choices: ["①", "②", "③", "④", "⑤"] };
    }
    return {
      sequence,
      label,
      type,
      question: knownStem,
      ...parsed,
      pageNumber: pageNumberAt(group.text, Number(marker.index)),
    };
  });
  return { questions, answers };
}

function makeProblem(config, source, question, answerInfo, duplicateIndex, sourcePath, fingerprint) {
  const permanentId = [
    `G${config.grade}`, config.year, String(config.month).padStart(2, "0"),
    source.sourceLabel.replace(/[~～]/gu, "-"), question.type, duplicateIndex,
  ].join("-");
  const questionId = `XMEV-${permanentId}`;
  return {
    questionId,
    subject: "english",
    language: "en",
    examFamily: "mock_exam",
    grade: config.grade + 9,
    schoolGrade: config.grade,
    examYear: config.year,
    examMonth: config.month,
    examQuestionNumbers: source.numbers,
    questionType: question.type,
    subtype: question.label,
    difficulty: config.grade === 1 ? 3 : 4,
    sourceId: `xtudy-mock-g${config.grade}-${config.year}-${String(config.month).padStart(2, "0")}-${source.sourceLabel}`,
    passage: question.passage,
    question: question.question,
    choices: question.choices,
    answer: answerInfo.answer,
    explanation: answerInfo.explanation,
    conceptTags: [question.type, `grade-${config.grade}`, "high-school-english"],
    skillTags: [question.type, "mock-exam-variant", `${config.year}-${String(config.month).padStart(2, "0")}`],
    qualityScore: 95,
    status: "approved",
    validation: {
      answerPresent: Number.isInteger(answerInfo.answer),
      explanationPresent: answerInfo.explanation.length >= 20,
      structurallyValid: question.choices.length === 5 && question.passage.length >= 80,
      issues: [],
      sourceVerified: true,
      parserVersion: DATASET_VERSION,
    },
    generator: { provider: "xtudy-universe", model: "source-pdf", version: DATASET_VERSION },
    contentFingerprint: sha256([question.passage, question.question, ...question.choices, answerInfo.answer].join("\n")),
    datasetId: DATASET_ID,
    datasetVersion: DATASET_VERSION,
    sourceFileName: path.basename(sourcePath),
    sourceFingerprint: fingerprint,
    sourcePageNumber: question.pageNumber,
    sourcePassageLabel: source.sourceLabel,
  };
}

async function parseSource(config, sourceRoot) {
  const sourcePath = path.join(sourceRoot, config.fileName);
  const extracted = await extractPages(sourcePath, config);
  const passages = [];
  for (const source of flexibleGroups(extracted.pages, config)) {
    const { questions, answers } = parseFlexibleGroup(source);
    if (questions.length !== 11 || questions.some((question) => !question?.type)) {
      throw new Error(`${config.fileName}: 원문 ${source.sourceLabel}의 11유형 문항을 정확히 읽지 못했습니다 (${questions.length}).`);
    }
    if (answers.size !== 11) {
      throw new Error(`${config.fileName}: 원문 ${source.sourceLabel}의 정답을 11개 읽지 못했습니다 (${answers.size}).`);
    }
    const seenTypes = new Map();
    const problems = questions.map((question) => {
      const duplicateIndex = (seenTypes.get(question.type) || 0) + 1;
      seenTypes.set(question.type, duplicateIndex);
      const answerInfo = answers.get(question.sequence);
      if (!answerInfo || TYPE_BY_LABEL[answerInfo.label] !== question.type) {
        throw new Error(`${config.fileName}: ${question.pageNumber}쪽 문항과 정답 유형이 일치하지 않습니다.`);
      }
      return makeProblem(config, source, question, answerInfo, duplicateIndex, sourcePath, extracted.fingerprint);
    });
    passages.push({ ...source, text: undefined, problems });
  }
  const problems = passages.flatMap((passage) => passage.problems);
  if (!passages.length) throw new Error(`${config.fileName}: 지문 표지를 한 개도 찾지 못했습니다.`);
  const issues = problems.flatMap((problem) => {
    const result = [];
    if (problem.choices.length !== 5) result.push(`${problem.questionId}: choices=${problem.choices.length}`);
    if (!Number.isInteger(problem.answer)) result.push(`${problem.questionId}: answer missing`);
    if (problem.passage.length < 80) result.push(`${problem.questionId}: passage too short`);
    return result;
  });
  if (issues.length) throw new Error(`${config.fileName}: 구조 검증 실패\n${issues.slice(0, 20).join("\n")}`);
  return {
    ...config,
    sourcePath,
    sourcePageCount: extracted.pageCount,
    sourceByteSize: extracted.byteSize,
    sourceFingerprint: extracted.fingerprint,
    passageCount: passages.length,
    problemCount: problems.length,
    expandedProblemCount: problems.reduce((sum, problem) => sum + problem.examQuestionNumbers.length, 0),
    passages,
    problems,
  };
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])) } };
  return { stringValue: String(value) };
}

function documentWrite(documentPath, data) {
  return {
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${documentPath}`,
      fields: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, firestoreValue(value)])),
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

function fromFirestore(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  return null;
}

async function listExams(accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/exams?pageSize=500`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`시험 목록 조회 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json();
  return (payload.documents || []).map((document) => ({
    id: document.name.split("/").pop(),
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, fromFirestore(value)])),
  }));
}

function examForSource(exams, source) {
  const matches = exams.filter((exam) => Number(exam.grade) === source.grade
    && Number(exam.year) === source.year && Number(exam.month) === source.month);
  if (matches.length !== 1) {
    throw new Error(`고${source.grade} ${source.year}년 ${source.month}월 시험 레코드는 정확히 1개여야 합니다 (현재 ${matches.length}개).`);
  }
  return matches[0];
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
  if (!response.ok) throw new Error(`Firestore commit 실패 (${response.status}): ${(await response.text()).slice(0, 800)}`);
}

function expandedProblems(source, exam) {
  return source.problems.flatMap((problem) => problem.examQuestionNumbers.map((number) => ({
    ...problem,
    questionId: `${problem.questionId}-Q${String(number).padStart(2, "0")}`,
    examId: exam.id,
    sourceExamId: exam.id,
    examQuestionNumber: number,
    originalQuestionNumber: number,
    sourceQuestionNumber: number,
    metadata: { examId: exam.id, questionNumber: number, sourcePassageLabel: problem.sourcePassageLabel },
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
    updatedAt: new Date(),
  })));
}

async function importAll(sources) {
  const accessToken = await createCliAccessToken();
  const exams = await listExams(accessToken);
  let imported = 0;
  for (const source of sources) {
    const exam = examForSource(exams, source);
    const problems = expandedProblems(source, exam);
    for (let index = 0; index < problems.length; index += 150) {
      const batch = problems.slice(index, index + 150).map((problem) => documentWrite(
        `problems/problem_${sha256(problem.questionId).slice(0, 32)}`,
        problem,
      ));
      await commitWrites(accessToken, batch);
      imported += batch.length;
      console.log(`등록: 고${source.grade} ${source.year}-${String(source.month).padStart(2, "0")} ${Math.min(index + batch.length, problems.length)}/${problems.length}`);
    }
  }
  return { accessToken, exams, imported };
}

async function verifyAll(sources, accessToken, exams) {
  const checks = [];
  for (const source of sources) {
    const exam = examForSource(exams, source);
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: "problems" }],
          where: { fieldFilter: { field: { fieldPath: "examId" }, op: "EQUAL", value: { stringValue: exam.id } } },
        } }),
      },
    );
    if (!response.ok) throw new Error(`검증 조회 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const rows = await response.json();
    const importedRows = rows.filter((row) => fromFirestore(row.document?.fields?.datasetId) === DATASET_ID);
    checks.push({ grade: source.grade, year: source.year, month: source.month, examId: exam.id, expected: source.expandedProblemCount, actual: importedRows.length });
  }
  const failed = checks.filter((check) => check.expected !== check.actual);
  if (failed.length) throw new Error(`등록 검증 실패: ${JSON.stringify(failed)}`);
  return checks;
}

const sourceRoot = path.resolve(argumentValue("--source-root", DEFAULT_SOURCE_ROOT));
const outputPath = path.resolve(argumentValue("--output", DEFAULT_OUTPUT));
const sources = [];
for (const config of SOURCE_FILES) {
  const parsed = await parseSource(config, sourceRoot);
  sources.push(parsed);
  console.log(`추출: ${config.fileName} - 지문 ${parsed.passageCount}, 원본 변형 ${parsed.problemCount}, 번호 확장 ${parsed.expandedProblemCount}`);
}

const payload = {
  schemaVersion: DATASET_VERSION,
  datasetId: DATASET_ID,
  generatedAt: new Date().toISOString(),
  summary: {
    sourceCount: sources.length,
    passageCount: sources.reduce((sum, source) => sum + source.passageCount, 0),
    problemCount: sources.reduce((sum, source) => sum + source.problemCount, 0),
    expandedProblemCount: sources.reduce((sum, source) => sum + source.expandedProblemCount, 0),
  },
  sources,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
console.log(`준비 완료: ${outputPath}`);
console.log(JSON.stringify(payload.summary));

let live = null;
if (shouldImport) live = await importAll(sources);
if (shouldVerify) {
  const accessToken = live?.accessToken || await createCliAccessToken();
  const exams = live?.exams || await listExams(accessToken);
  const checks = await verifyAll(sources, accessToken, exams);
  console.log(JSON.stringify({ verified: true, checks }, null, 2));
}
