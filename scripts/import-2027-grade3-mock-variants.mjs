#!/usr/bin/env node

/**
 * 2027학년도 고3 모의고사 11유형 문제은행 등록기.
 *
 * 최종 PDF를 다운로드 자료로 게시하지 않는다. 기존 검수 PDF의 페이지 구조를
 * parser input으로만 사용해 원문 번호 × 11유형의 개별 problem document로 분해한다.
 * 실제 파싱/검증 로직은 import-mock-exam-variant-pdfs.mjs와 동일하게 유지한다.
 *
 * 대상(2026년 시행, 2027학년도 준비): 3월 / 5월 / 6월 / 7월
 *
 * 사용:
 *   node scripts/import-2027-grade3-mock-variants.mjs \
 *     --source-root="$HOME/Downloads" --import --verify
 */

import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ID = "xstudy-problem-bank";
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const BASE_IMPORTER = path.join(THIS_DIR, "import-mock-exam-variant-pdfs.mjs");
const GENERATED_IMPORTER = path.resolve("tmp/import-2027-grade3-mock-variants.generated.mjs");

const SOURCES = Object.freeze([
  [3, 2026, 3, "고3_2026년_03월_11유형_변형문제_회차완료본.pdf"],
  [3, 2026, 5, "고3_2026년_05월_11유형_변형문제_회차완료본.pdf"],
  [3, 2026, 6, "고3_2026년_06월_11유형_변형문제_회차완료본.pdf"],
  [3, 2026, 7, "고3_2026년_07월_11유형_변형문제_회차완료본.pdf"],
].map(([grade, year, month, fileName]) => ({ grade, year, month, fileName })));

const EXAM_METADATA = Object.freeze({
  "3-2026-03": {
    id: "exam_english_g3_2026_03",
    title: "2026년 3월 고3 전국연합학력평가",
    organizer: "서울특별시교육청",
  },
  "3-2026-05": {
    id: "exam_english_g3_2026_05",
    title: "2026년 5월 고3 전국연합학력평가",
    organizer: "시도교육청",
  },
  "3-2026-06": {
    id: "exam_english_g3_2026_06",
    title: "2027학년도 6월 모의평가",
    organizer: "한국교육과정평가원",
  },
  "3-2026-07": {
    id: "exam_english_g3_2026_07",
    title: "2026년 7월 고3 전국연합학력평가",
    organizer: "인천광역시교육청",
  },
});

function firestoreValue(value) {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
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

async function getExam(accessToken, id) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/exams/${id}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Exam lookup failed (${response.status}): ${(await response.text()).slice(0, 600)}`);
  return response.json();
}

async function writeExam(accessToken, source) {
  const key = `${source.grade}-${source.year}-${String(source.month).padStart(2, "0")}`;
  const meta = EXAM_METADATA[key];
  if (!meta) throw new Error(`Missing exam metadata: ${key}`);
  const existing = await getExam(accessToken, meta.id);
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/exams/${meta.id}`;

  if (existing) {
    const response = await fetch(`${baseUrl}?updateMask.fieldPaths=has_variant_workbook`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { has_variant_workbook: firestoreValue(true) } }),
    });
    if (!response.ok) throw new Error(`Exam flag update failed (${response.status}): ${(await response.text()).slice(0, 600)}`);
    console.log(`[exam] ${meta.id}: variant workbook flag enabled`);
    return;
  }

  const fields = {
    title: meta.title,
    year: source.year,
    grade: source.grade,
    month: source.month,
    organizer: meta.organizer,
    has_variant_workbook: true,
    collected_at: new Date(),
  };
  const response = await fetch(baseUrl, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, firestoreValue(value)])),
    }),
  });
  if (!response.ok) throw new Error(`Exam create failed (${response.status}): ${(await response.text()).slice(0, 600)}`);
  console.log(`[exam] ${meta.id}: created for problem-level variant workbook`);
}

function patchedImporterSource(source) {
  const sourceList = `const SOURCE_FILES = Object.freeze([\n${SOURCES.map((item) => `  [${item.grade}, ${item.year}, ${item.month}, ${JSON.stringify(item.fileName)}],`).join("\n")}\n].map(([grade, year, month, fileName]) => ({ grade, year, month, fileName })));`;
  const pattern = /const SOURCE_FILES = Object\.freeze\(\[[\s\S]*?\]\.map\(\(\[grade, year, month, fileName\]\) => \(\{ grade, year, month, fileName \}\)\)\);/u;
  if (!pattern.test(source)) throw new Error("Could not locate SOURCE_FILES in base importer");
  return source
    .replace(pattern, sourceList)
    .replace('const DATASET_ID = "xtudy-mock-exam-11-variants-v1";', 'const DATASET_ID = "xtudy-2027-grade3-mock-11-variants-v1";')
    .replace('const DATASET_VERSION = "2026-08-29.1";', 'const DATASET_VERSION = "2026-09-15.1";');
}

function runNode(filePath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [filePath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Importer exited with code ${code}`)));
  });
}

const passThroughArgs = process.argv.slice(2);
const wantsLive = passThroughArgs.includes("--import") || passThroughArgs.includes("--verify");
if (wantsLive) {
  const accessToken = await createCliAccessToken();
  for (const source of SOURCES) await writeExam(accessToken, source);
}

const base = await readFile(BASE_IMPORTER, "utf8");
const patched = patchedImporterSource(base);
await mkdir(path.dirname(GENERATED_IMPORTER), { recursive: true });
await writeFile(GENERATED_IMPORTER, patched, "utf8");

try {
  await runNode(GENERATED_IMPORTER, passThroughArgs);
} finally {
  await rm(GENERATED_IMPORTER, { force: true });
}
