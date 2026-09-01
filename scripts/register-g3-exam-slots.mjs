#!/usr/bin/env node

import { createRequire } from "node:module";

const PROJECT_ID = process.env.PROBLEM_BANK_PROJECT_ID || "xstudy-problem-bank";

const SESSIONS = Object.freeze([
  { year: 2025, month: 3, title: "2025년 3월 고3 전국연합학력평가", organizer: "서울특별시교육청", examKind: "national_mock" },
  { year: 2025, month: 5, title: "2025년 5월 고3 전국연합학력평가", organizer: "경기도교육청", examKind: "national_mock" },
  { year: 2025, month: 6, title: "2026학년도 6월 모의평가", organizer: "한국교육과정평가원", examKind: "kice_mock" },
  { year: 2025, month: 7, title: "2025년 7월 고3 전국연합학력평가", organizer: "인천광역시교육청", examKind: "national_mock" },
  { year: 2025, month: 9, title: "2026학년도 9월 모의평가", organizer: "한국교육과정평가원", examKind: "kice_mock" },
  { year: 2025, month: 10, title: "2025년 10월 고3 전국연합학력평가", organizer: "서울특별시교육청", examKind: "national_mock" },
  { year: 2025, month: 11, title: "2026학년도 대학수학능력시험", organizer: "한국교육과정평가원", examKind: "csat" },
  { year: 2026, month: 3, title: "2026년 3월 고3 전국연합학력평가", organizer: "서울특별시교육청", examKind: "national_mock" },
  { year: 2026, month: 5, title: "2026년 5월 고3 전국연합학력평가", organizer: "경기도교육청", examKind: "national_mock" },
  { year: 2026, month: 6, title: "2027학년도 6월 모의평가", organizer: "한국교육과정평가원", examKind: "kice_mock" },
  { year: 2026, month: 7, title: "2026년 7월 고3 전국연합학력평가", organizer: "인천광역시교육청", examKind: "national_mock" },
]);

function firestoreValue(value) {
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  return { stringValue: String(value) };
}

async function accessToken() {
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

function examId(year, month) {
  return `exam_english_g3_${year}_${String(month).padStart(2, "0")}`;
}

function writeFor(session) {
  const id = examId(session.year, session.month);
  const fields = {
    id,
    year: session.year,
    grade: 3,
    month: session.month,
    subject: "english",
    title: session.title,
    organizer: session.organizer,
    examKind: session.examKind,
    problemBankReady: true,
  };
  return {
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/exams/${id}`,
      fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])),
    },
    updateMask: { fieldPaths: Object.keys(fields) },
  };
}

async function main() {
  const token = await accessToken();
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ writes: SESSIONS.map(writeFor) }),
    },
  );
  if (!response.ok) throw new Error(`exam slot registration failed (${response.status}): ${(await response.text()).slice(0, 800)}`);
  console.log(JSON.stringify({ ok: true, projectId: PROJECT_ID, grade: 3, sessionCount: SESSIONS.length, examIds: SESSIONS.map((s) => examId(s.year, s.month)) }, null, 2));
}

await main();
