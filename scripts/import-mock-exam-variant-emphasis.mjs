#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const PROJECT_ID = "xstudy-problem-bank";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const FORMATTING_VERSION = "emphasis-ranges-v1";
const DEFAULT_INPUT = path.resolve("tmp/mock-exam-variant-import.json");
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const INLINE_CANDIDATE_TYPES = new Set(["grammar", "vocabulary"]);
const BOLD_FONT_PATTERN = /(?:bold|semi[- ]?bold|demi|black|heavy|extra[- ]?bold|ultra[- ]?bold|700|800|900)/iu;
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
  return createHash("sha256").update(String(value)).digest("hex");
}

function stripChoicePrefix(value, index) {
  let text = clean(value, 2_000);
  const circled = CIRCLED[index - 1];
  if (circled && text.startsWith(circled)) text = text.slice(circled.length).trimStart();
  return text.replace(new RegExp(`^\\(?${index}\\)?[.)]?\\s+`, "u"), "").trim();
}

function impliedMeaningTarget(explanation) {
  const match = clean(explanation, 12_000).match(
    /(?:굵게\s*표시된|굵은\s*글씨로\s*강조된|밑줄\s*친|밑줄\s*표시된)\s*[“"']([^”"']{2,180})[”"']/u,
  );
  return match?.[1]?.trim() || "";
}

function fontLooksBold(item, styles) {
  const style = styles?.[item?.fontName] || {};
  const descriptor = [item?.fontName, style?.fontFamily, style?.fontWeight].filter(Boolean).join(" ");
  return BOLD_FONT_PATTERN.test(descriptor);
}

async function extractBoldFragments(sourcePath) {
  const bytes = await readFile(sourcePath);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = new Map();
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const fragments = [];
    for (const item of content.items) {
      if (!item || !("str" in item) || !fontLooksBold(item, content.styles)) continue;
      const text = clean(item.str, 500);
      if (!text || text.length < 2) continue;
      fragments.push(text);
    }
    pages.set(pageNumber, [...new Set(fragments)]);
  }
  return pages;
}

function structuralRanges(problem) {
  const passage = clean(problem.passage, 30_000);
  const type = clean(problem.questionType, 80).toLowerCase();
  const ranges = [];

  if (INLINE_CANDIDATE_TYPES.has(type) && Array.isArray(problem.choices)) {
    let cursor = 0;
    problem.choices.slice(0, 5).forEach((choice, choiceOffset) => {
      const candidate = stripChoicePrefix(choice, choiceOffset + 1);
      if (!candidate || candidate.length > 180) return;
      const marker = CIRCLED[choiceOffset];
      const markerIndex = passage.indexOf(marker, cursor);
      const searchFrom = markerIndex >= 0 ? markerIndex + marker.length : cursor;
      const start = passage.indexOf(candidate, Math.max(0, searchFrom));
      if (start < 0) return;
      if (markerIndex >= 0) {
        const between = passage.slice(markerIndex + marker.length, start);
        if (!/^\s*$/u.test(between) || between.length > 4) return;
      }
      ranges.push({ target: "passage", start, end: start + candidate.length, style: "bold", source: "question-structure" });
      cursor = start + candidate.length;
    });
  }

  if (type === "implied_meaning") {
    const target = impliedMeaningTarget(problem.explanation);
    const start = target ? passage.indexOf(target) : -1;
    if (start >= 0) ranges.push({ target: "passage", start, end: start + target.length, style: "bold", source: "explanation-target" });
  }

  return ranges;
}

function pdfRanges(problem, boldFragments) {
  const passage = clean(problem.passage, 30_000);
  if (!passage || !Array.isArray(boldFragments)) return [];
  const ranges = [];
  for (const fragment of boldFragments) {
    const candidate = clean(fragment, 500);
    if (!candidate || candidate.length < 3) continue;
    let offset = 0;
    while (offset < passage.length) {
      const start = passage.indexOf(candidate, offset);
      if (start < 0) break;
      ranges.push({ target: "passage", start, end: start + candidate.length, style: "bold", source: "pdf-font" });
      offset = start + candidate.length;
    }
  }
  return ranges;
}

function normalizeRanges(ranges, textLength) {
  const unique = new Map();
  for (const range of ranges) {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > textLength) continue;
    const key = `${range.target}:${start}:${end}:${range.style}`;
    if (!unique.has(key)) unique.set(key, { ...range, start, end });
  }
  const sorted = [...unique.values()].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && previous.target === range.target && previous.style === range.style && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
      previous.source = previous.source === range.source ? previous.source : "pdf+structure";
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

async function enrichPayload(payload) {
  if (payload?.datasetId !== DATASET_ID || !Array.isArray(payload?.sources)) {
    throw new Error("mock exam import payload is invalid");
  }
  let emphasizedProblems = 0;
  let emphasisRangeCount = 0;
  for (const source of payload.sources) {
    const sourcePath = path.resolve(source.sourcePath || "");
    const boldByPage = sourcePath ? await extractBoldFragments(sourcePath) : new Map();
    source.problems = (source.problems || []).map((problem) => {
      const passage = clean(problem.passage, 30_000);
      const pageFragments = boldByPage.get(Number(problem.sourcePageNumber)) || [];
      const ranges = normalizeRanges([
        ...pdfRanges(problem, pageFragments),
        ...structuralRanges(problem),
      ], passage.length);
      if (ranges.length) {
        emphasizedProblems += 1;
        emphasisRangeCount += ranges.length;
      }
      return {
        ...problem,
        emphasisRanges: ranges,
        formattingVersion: FORMATTING_VERSION,
        formattingFingerprint: sha256(JSON.stringify({ passage, ranges })),
      };
    });
    if (Array.isArray(source.passages)) {
      const byId = new Map(source.problems.map((problem) => [problem.questionId, problem]));
      source.passages = source.passages.map((passage) => ({
        ...passage,
        problems: Array.isArray(passage.problems)
          ? passage.problems.map((problem) => byId.get(problem.questionId) || problem)
          : passage.problems,
      }));
    }
  }
  payload.formattingVersion = FORMATTING_VERSION;
  payload.formattingSummary = { emphasizedProblems, emphasisRangeCount };
  return payload;
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, firestoreValue(child)])) } };
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
  const matches = exams.filter((exam) => Number(exam.grade) === Number(source.grade)
    && Number(exam.year) === Number(source.year) && Number(exam.month) === Number(source.month));
  if (matches.length !== 1) throw new Error(`시험 레코드는 정확히 1개여야 합니다: 고${source.grade} ${source.year}-${source.month}`);
  return matches[0];
}

function expandedProblems(source, exam) {
  return (source.problems || []).flatMap((problem) => (problem.examQuestionNumbers || []).map((number) => ({
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

async function importAll(payload) {
  const accessToken = await createCliAccessToken();
  const exams = await listExams(accessToken);
  let imported = 0;
  for (const source of payload.sources) {
    const exam = examForSource(exams, source);
    const problems = expandedProblems(source, exam);
    for (let index = 0; index < problems.length; index += 150) {
      const batch = problems.slice(index, index + 150).map((problem) => documentWrite(
        `problems/problem_${sha256(problem.questionId).slice(0, 32)}`,
        problem,
      ));
      await commitWrites(accessToken, batch);
      imported += batch.length;
      console.log(`강조정보 등록: 고${source.grade} ${source.year}-${String(source.month).padStart(2, "0")} ${Math.min(index + batch.length, problems.length)}/${problems.length}`);
    }
  }
  return { accessToken, exams, imported };
}

async function verifyAll(payload, accessToken, exams) {
  const checks = [];
  for (const source of payload.sources) {
    const exam = examForSource(exams, source);
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: "problems" }],
          where: { compositeFilter: { op: "AND", filters: [
            { fieldFilter: { field: { fieldPath: "examId" }, op: "EQUAL", value: { stringValue: exam.id } } },
            { fieldFilter: { field: { fieldPath: "datasetId" }, op: "EQUAL", value: { stringValue: DATASET_ID } } },
          ] } },
        } }),
      },
    );
    if (!response.ok) throw new Error(`검증 조회 실패 (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const rows = await response.json();
    const expected = Number(source.expandedProblemCount) || expandedProblems(source, exam).length;
    const actual = rows.filter((row) => row.document).length;
    checks.push({ grade: source.grade, year: source.year, month: source.month, expected, actual });
  }
  const failed = checks.filter((check) => check.expected !== check.actual);
  if (failed.length) throw new Error(`강조정보 등록 검증 실패: ${JSON.stringify(failed)}`);
  return checks;
}

const inputPath = path.resolve(argumentValue("--input", DEFAULT_INPUT));
const payload = await enrichPayload(JSON.parse(await readFile(inputPath, "utf8")));
await writeFile(inputPath, JSON.stringify(payload, null, 2), "utf8");
console.log(`강조정보 조립 완료: ${inputPath}`);
console.log(JSON.stringify(payload.formattingSummary));

let live = null;
if (shouldImport) live = await importAll(payload);
if (shouldVerify) {
  const accessToken = live?.accessToken || await createCliAccessToken();
  const exams = live?.exams || await listExams(accessToken);
  const checks = await verifyAll(payload, accessToken, exams);
  console.log(JSON.stringify({ verified: true, formattingVersion: FORMATTING_VERSION, checks }, null, 2));
}
