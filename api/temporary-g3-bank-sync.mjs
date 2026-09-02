import crypto from "node:crypto";
import { inflateSync } from "node:zlib";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN = "g3final_20260902_K7mQ4pV9";
const DATASET_ID = "xtudy-g3-final-11-variants-v1";
const DATASET_VERSION = "2026-09-02.1";
const STAGING_COLLECTION = "_xtudy_g3_final_sync_staging";
const VALID_NUMBERS = new Set([...Array.from({ length: 7 }, (_, i) => i + 18), ...Array.from({ length: 17 }, (_, i) => i + 29)]);
const TYPE_LABELS = {
  grammar: "어법", topic: "주제", title: "제목", vocabulary: "어휘", implied_meaning: "함축 의미추론",
  summary: "요약문 완성", blank_inference: "빈칸추론", paragraph_order: "문장의 순서",
  sentence_insertion: "문장삽입", irrelevant_sentence: "글의 흐름", factual_description: "내용일치",
};
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

function clean(value, max = 500) { return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max); }
function examId(year, month) { return `exam_english_g3_${year}_${String(month).padStart(2, "0")}`; }
function sessionKey(year, month) { return `g3-${year}-${String(month).padStart(2, "0")}`; }
function expectedFor(year, month) { return year === 2025 && month === 10 ? { sets: 20, problems: 220, expanded: 253 } : { sets: 21, problems: 231, expanded: 264 }; }
function configFromKey(value) {
  const m = /^g3-(2025|2026)-(03|05|06|07|09|10|11)$/u.exec(clean(value, 40));
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]);
  return SESSIONS.find((s) => s.year === year && s.month === month) || null;
}
function stageDocId(key, index) { return `g3sync_${key}_${String(index).padStart(3, "0")}`; }
function emphasisRangesFrom(problem) {
  if (!Array.isArray(problem?.emphasisRanges)) return [];
  return problem.emphasisRanges.flatMap((r) => {
    const target = clean(r?.target, 20), style = clean(r?.style, 20), start = Number(r?.start), end = Number(r?.end);
    if (target !== "passage" || !["bold", "underline"].includes(style) || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return [];
    return [{ target, start, end, style, source: clean(r?.source, 80) || undefined }];
  });
}
async function ensureExams(firestore) {
  const batch = firestore.batch();
  for (const s of SESSIONS) {
    const id = examId(s.year, s.month);
    batch.set(firestore.collection("exams").doc(id), {
      id, year: s.year, grade: 3, month: s.month, subject: "english", title: s.title, organizer: s.organizer,
      examKind: s.examKind, problemBankReady: false, variantBankExpected: true,
    }, { merge: true });
  }
  await batch.commit();
  return { examCount: SESSIONS.length, problemBankReady: false };
}
async function stageChunk(req, firestore) {
  const key = clean(req.query?.session, 40);
  if (!configFromKey(key)) throw Object.assign(new Error("session-invalid"), { statusCode: 400 });
  const index = Number(req.query?.index), total = Number(req.query?.total), data = clean(req.query?.data, 12000);
  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total < 1 || total > 30 || index >= total) throw Object.assign(new Error("chunk-index-invalid"), { statusCode: 400 });
  if (!data || data.length > 11000 || !/^[A-Za-z0-9_-]+$/u.test(data)) throw Object.assign(new Error("chunk-data-invalid"), { statusCode: 400 });
  await firestore.collection(STAGING_COLLECTION).doc(stageDocId(key, index)).set({ sessionKey: key, index, total, data, updatedAt: new Date() });
  return { session: key, index, total, received: data.length };
}
async function syncSession(req, firestore) {
  const key = clean(req.query?.session, 40), config = configFromKey(key);
  if (!config) throw Object.assign(new Error("session-invalid"), { statusCode: 400 });
  const total = Number(req.query?.total);
  if (!Number.isInteger(total) || total < 1 || total > 30) throw Object.assign(new Error("total-invalid"), { statusCode: 400 });
  const refs = Array.from({ length: total }, (_, i) => firestore.collection(STAGING_COLLECTION).doc(stageDocId(key, i)));
  const snaps = await firestore.getAll(...refs);
  if (snaps.some((s) => !s.exists)) throw Object.assign(new Error("chunks-incomplete"), { statusCode: 409 });
  const chunks = snaps.map((s, i) => { const d = s.data() || {}; if (d.sessionKey !== key || Number(d.index) !== i || Number(d.total) !== total) throw new Error("chunk-mismatch"); return clean(d.data, 12000); });
  let payload;
  try { payload = JSON.parse(inflateSync(Buffer.from(chunks.join(""), "base64url")).toString("utf8")); }
  catch { throw Object.assign(new Error("payload-invalid"), { statusCode: 400 }); }
  if (payload.datasetId !== DATASET_ID || payload.datasetVersion !== DATASET_VERSION || Number(payload.grade) !== 3 || Number(payload.year) !== config.year || Number(payload.month) !== config.month || !Array.isArray(payload.sources)) throw Object.assign(new Error("payload-metadata-invalid"), { statusCode: 400 });
  const expected = expectedFor(config.year, config.month);
  const sourceProblemCount = payload.sources.reduce((sum, s) => sum + (Array.isArray(s.problems) ? s.problems.length : 0), 0);
  const expanded = payload.sources.reduce((sum, s) => sum + (Array.isArray(s.numbers) && Array.isArray(s.problems) ? s.numbers.length * s.problems.length : 0), 0);
  if (payload.sources.length !== expected.sets || sourceProblemCount !== expected.problems || expanded !== expected.expanded) throw Object.assign(new Error("payload-count-invalid"), { statusCode: 400 });
  const eid = examId(config.year, config.month);
  const examRef = firestore.collection("exams").doc(eid);
  if (!(await examRef.get()).exists) throw Object.assign(new Error("exam-not-found"), { statusCode: 404 });
  const now = new Date(), writes = [], distribution = {};
  for (const source of payload.sources) {
    if (!Array.isArray(source.numbers) || !Array.isArray(source.problems) || source.problems.length !== 11) throw Object.assign(new Error("source-invalid"), { statusCode: 400 });
    for (const problem of source.problems) {
      const type = clean(problem.questionType, 80);
      if (!TYPE_LABELS[type]) throw Object.assign(new Error("type-invalid"), { statusCode: 400 });
      for (const rawNumber of source.numbers) {
        const number = Number(rawNumber);
        if (!VALID_NUMBERS.has(number)) throw Object.assign(new Error("question-number-invalid"), { statusCode: 400 });
        const questionId = `${clean(problem.baseQuestionId, 160)}-Q${String(number).padStart(2, "0")}`;
        const docId = `problem_${crypto.createHash("sha256").update(questionId).digest("hex").slice(0, 32)}`;
        const passage = String(problem.passage || ""), choices = Array.isArray(problem.choices) ? problem.choices.map(String) : [], answer = Number(problem.answer), explanation = String(problem.explanation || "");
        if (passage.length < 80 || choices.length !== 5 || !Number.isInteger(answer) || answer < 1 || answer > 5 || explanation.length < 20) throw Object.assign(new Error("problem-structure-invalid"), { statusCode: 400 });
        const record = {
          questionId, subject: "english", language: "en", examFamily: config.examKind === "csat" ? "csat" : "mock_exam",
          grade: 12, schoolGrade: 3, examYear: config.year, examMonth: config.month, examQuestionNumbers: source.numbers.map(Number),
          questionType: type, subtype: clean(problem.subtype, 80), difficulty: 4,
          sourceId: `xtudy-g3-${config.year}-${String(config.month).padStart(2, "0")}-${clean(source.sourceLabel, 30)}`,
          passage, question: String(problem.question || ""), choices, answer, explanation,
          emphasisRanges: emphasisRangesFrom(problem), formattingVersion: clean(problem.formattingVersion, 80) || undefined,
          formattingFingerprint: clean(problem.formattingFingerprint, 100) || undefined,
          conceptTags: [type, "grade-3", "high-school-english"], skillTags: [type, config.examKind === "csat" ? "csat-variant" : "mock-exam-variant", `${config.year}-${String(config.month).padStart(2, "0")}`],
          qualityScore: 95, status: "approved", validation: { answerPresent: true, explanationPresent: true, structurallyValid: true, issues: [], sourceVerified: true, parserVersion: DATASET_VERSION },
          generator: { provider: "xtudy-universe", model: "source-pdf", version: DATASET_VERSION },
          datasetId: DATASET_ID, datasetVersion: DATASET_VERSION, sourceFileName: clean(payload.sourceFileName, 240), sourcePageNumber: Number(problem.sourcePageNumber) || null,
          sourcePassageLabel: clean(source.sourceLabel, 30), duplicateIndex: 1, examId: eid, sourceExamId: eid, examQuestionNumber: number, originalQuestionNumber: number, sourceQuestionNumber: number,
          metadata: { examId: eid, questionNumber: number, sourcePassageLabel: clean(source.sourceLabel, 30) }, createdAt: now, updatedAt: now,
        };
        writes.push({ ref: firestore.collection("problems").doc(docId), record });
        distribution[`${number}:${type}`] = (distribution[`${number}:${type}`] || 0) + 1;
      }
    }
  }
  if (writes.length !== expected.expanded || writes.length + refs.length > 500) throw Object.assign(new Error("write-count-invalid"), { statusCode: 400 });
  const batch = firestore.batch();
  for (const w of writes) batch.set(w.ref, w.record, { merge: true });
  for (const ref of refs) batch.delete(ref);
  await batch.commit();
  return { session: key, examId: eid, sourceProblems: sourceProblemCount, imported: writes.length, distribution };
}
async function auditSession(firestore, config) {
  const eid = examId(config.year, config.month), expected = expectedFor(config.year, config.month);
  const exam = await firestore.collection("exams").doc(eid).get();
  const snap = await firestore.collection("problems").where("examId", "==", eid).limit(600).get();
  const docs = snap.docs.map((d) => d.data() || {}).filter((p) => p.datasetId === DATASET_ID && p.status === "approved");
  const buckets = {}, emphasisProblems = docs.filter((p) => Array.isArray(p.emphasisRanges) && p.emphasisRanges.length).length;
  for (const p of docs) buckets[`${Number(p.examQuestionNumber)}:${clean(p.questionType, 80)}`] = (buckets[`${Number(p.examQuestionNumber)}:${clean(p.questionType, 80)}`] || 0) + 1;
  const expectedNumbers = [...VALID_NUMBERS].filter((n) => !(config.year === 2025 && config.month === 10 && n === 20));
  const missing = [];
  for (const n of expectedNumbers) for (const type of Object.keys(TYPE_LABELS)) if ((buckets[`${n}:${type}`] || 0) !== 1) missing.push(`${n}:${type}:${buckets[`${n}:${type}`] || 0}`);
  return { session: sessionKey(config.year, config.month), examId: eid, examExists: exam.exists, problemBankReady: exam.exists ? Boolean(exam.data()?.problemBankReady) : false, approvedDatasetProblems: docs.length, expectedExpanded: expected.expanded, emphasisProblems, missing: missing.slice(0, 50), valid: docs.length === expected.expanded && missing.length === 0 };
}
async function markReady(firestore, config) {
  const audit = await auditSession(firestore, config);
  if (!audit.valid) throw Object.assign(new Error("audit-not-ready"), { statusCode: 409 });
  await firestore.collection("exams").doc(audit.examId).set({ problemBankReady: true, variantBankExpected: true, problemBankVerifiedAt: new Date(), problemBankDatasetId: DATASET_ID, problemBankDatasetVersion: DATASET_VERSION }, { merge: true });
  return { ...audit, problemBankReady: true };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" || clean(req.query?.token, 100) !== TOKEN) return res.status(404).json({ error: "not-found" });
  const action = clean(req.query?.action, 40), firestore = getProblemBankFirestore();
  try {
    if (action === "ensure-exams") return res.status(200).json(await ensureExams(firestore));
    if (action === "stage") return res.status(200).json(await stageChunk(req, firestore));
    if (action === "sync") return res.status(200).json(await syncSession(req, firestore));
    if (action === "audit-all") { const sessions = []; for (const s of SESSIONS) sessions.push(await auditSession(firestore, s)); return res.status(200).json({ datasetId: DATASET_ID, datasetVersion: DATASET_VERSION, sessions }); }
    if (action === "ready") { const config = configFromKey(req.query?.session); if (!config) return res.status(400).json({ error: "session-invalid" }); return res.status(200).json(await markReady(firestore, config)); }
    return res.status(400).json({ error: "action-invalid" });
  } catch (error) {
    console.error("[temporary-g3-bank-sync]", error);
    return res.status(Number(error?.statusCode) || 500).json({ error: clean(error instanceof Error ? error.message : error, 500) });
  }
}
