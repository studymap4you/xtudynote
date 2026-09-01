import crypto from "node:crypto";
import { brotliDecompressSync } from "node:zlib";
import backfillHandler from "./_temporary-emphasis-backfill-v4.mjs";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN = "xubf3_20260901_F7kQ2r9Lm4";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const STAGING_COLLECTION = "_xtudy_high_school_sync_staging";
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const VOCAB_FORMATTING_VERSION = "emphasis-backfill-v6-choice-marker-exact";
const SESSIONS = [
  [1, 2025, 3], [1, 2025, 6], [1, 2025, 9], [1, 2025, 10], [1, 2026, 3], [1, 2026, 6],
  [2, 2025, 3], [2, 2025, 6], [2, 2025, 9], [2, 2025, 10], [2, 2026, 3], [2, 2026, 6],
];
const LEXICAL = /^[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*$/u;

function clean(value, max = 30000) {
  return String(value ?? "").normalize("NFC").replace(/\u0000/gu, "").trim().slice(0, max);
}
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function sessionParts(value) {
  const match = /^g([12])-(2025|2026)-(03|06|09|10)$/u.exec(clean(value, 40));
  if (!match) return null;
  const [, grade, year, month] = match;
  return { grade: Number(grade), year: Number(year), month: Number(month), sessionKey: clean(value, 40) };
}
async function stagedPayload(firestore, sessionKey) {
  const snapshot = await firestore.collection(STAGING_COLLECTION).where("sessionKey", "==", sessionKey).limit(30).get();
  if (snapshot.empty) return null;
  const chunks = snapshot.docs.map((doc) => doc.data() || {}).sort((left, right) => Number(left.index) - Number(right.index));
  const total = Number(chunks[0]?.total) || 0;
  if (!total || chunks.length !== total || chunks.some((chunk, index) => Number(chunk.index) !== index || Number(chunk.total) !== total)) {
    throw new Error("staged-payload-incomplete");
  }
  const compressed = Buffer.from(chunks.map((chunk) => clean(chunk.data, 12000)).join(""), "base64url");
  return JSON.parse(brotliDecompressSync(compressed).toString("utf8"));
}
function stripChoice(value, index) {
  let result = clean(value, 500).replace(/\s+/gu, " ");
  const marker = CIRCLED[index - 1];
  if (marker && result.startsWith(marker)) result = result.slice(marker.length).trimStart();
  return result.replace(new RegExp(`^\\(?${index}\\)?[.)]?\\s*`, "u"), "").trim();
}
function hasPassageRanges(problem) {
  return Array.isArray(problem?.emphasisRanges) && problem.emphasisRanges.some((range) =>
    range?.target === "passage" && Number.isInteger(Number(range.start)) && Number.isInteger(Number(range.end)) && Number(range.end) > Number(range.start));
}
function markerWordHits(passage, marker, word) {
  const hits = [];
  for (const match of passage.matchAll(new RegExp(marker, "gu"))) {
    const markerEnd = Number(match.index) + marker.length;
    const tail = passage.slice(markerEnd);
    const lexical = /^\s*([\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*)/u.exec(tail);
    if (!lexical || lexical[1] !== word) continue;
    const leading = lexical[0].length - lexical[1].length;
    const start = markerEnd + leading;
    const end = start + word.length;
    const after = passage.slice(end, Math.min(passage.length, end + 16));
    const splitSuffix = /^\s+(?:ed|ing|s|es|er|est|ly)\b/u.test(after);
    hits.push({ start, end, splitSuffix });
  }
  const cleanHits = hits.filter((hit) => !hit.splitSuffix);
  return cleanHits.length ? cleanHits : hits;
}
function exactVocabRanges(problem) {
  const passage = clean(problem.passage);
  if (!passage || !Array.isArray(problem.choices) || problem.choices.length < 5) return null;
  const choices = problem.choices.slice(0, 5).map((choice, index) => stripChoice(choice, index + 1));
  if (!choices.every((choice) => choice && choice.length <= 80 && LEXICAL.test(choice))) return null;
  const ranges = [];
  for (let index = 0; index < 5; index += 1) {
    const hits = markerWordHits(passage, CIRCLED[index], choices[index]);
    if (hits.length !== 1) return null;
    ranges.push({ target: "passage", start: hits[0].start, end: hits[0].end, style: "bold", source: "choice-marker-word-exact-v6" });
  }
  return ranges;
}
async function runVocabFix(req, res) {
  const execute = req.query?.execute === "1";
  const firestore = getProblemBankFirestore();
  const sessions = [];
  for (const [grade, year, month] of SESSIONS) {
    const examId = `exam_english_g${grade}_${year}_${String(month).padStart(2, "0")}`;
    const snapshot = await firestore.collection("problems").where("examId", "==", examId).limit(600).get();
    const docs = snapshot.docs.filter((doc) => {
      const problem = doc.data() || {};
      return problem.datasetId === DATASET_ID && clean(problem.questionType, 80).toLowerCase() === "vocabulary";
    });
    const stats = { grade, year, month, total: docs.length, existing: 0, recoverable: 0, unresolved: 0, updated: 0 };
    const unresolved = [];
    const writes = [];
    for (const doc of docs) {
      const problem = doc.data() || {};
      if (hasPassageRanges(problem)) { stats.existing += 1; continue; }
      const ranges = exactVocabRanges(problem);
      if (!ranges) {
        stats.unresolved += 1;
        unresolved.push({ id: problem.questionId || doc.id, number: problem.examQuestionNumber, choices: Array.isArray(problem.choices) ? problem.choices : [] });
        continue;
      }
      stats.recoverable += 1;
      writes.push({ ref: doc.ref, data: {
        emphasisRanges: ranges,
        formattingVersion: VOCAB_FORMATTING_VERSION,
        formattingFingerprint: hash(JSON.stringify({ passage: clean(problem.passage), ranges })),
        formattingBackfilledAt: new Date(),
        formattingBackfillMethod: "choice-marker-word-exact-v6",
      }});
    }
    if (execute && writes.length) {
      const batch = firestore.batch();
      for (const write of writes) batch.set(write.ref, write.data, { merge: true });
      await batch.commit();
      stats.updated = writes.length;
    }
    sessions.push({ ...stats, unresolvedItems: unresolved.slice(0, 50) });
  }
  const totals = sessions.reduce((acc, item) => {
    for (const key of ["total", "existing", "recoverable", "unresolved", "updated"]) acc[key] += item[key];
    return acc;
  }, { total: 0, existing: 0, recoverable: 0, unresolved: 0, updated: 0 });
  return res.status(200).json({ execute, datasetId: DATASET_ID, formattingVersion: VOCAB_FORMATTING_VERSION, totals, sessions });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (clean(req.query?.token, 100) !== TOKEN) return res.status(404).json({ error: "not-found" });
  if (req.query?.vocabfix === "1") {
    try { return await runVocabFix(req, res); }
    catch (error) { return res.status(500).json({ error: clean(error instanceof Error ? error.message : error, 500) }); }
  }
  if (req.query?.debug !== "1") return backfillHandler(req, res);
  const parsed = sessionParts(req.query?.session);
  if (!parsed) return res.status(400).json({ error: "invalid-session" });
  const { grade, year, month, sessionKey } = parsed;
  const examId = `exam_english_g${grade}_${year}_${String(month).padStart(2, "0")}`;
  const type = clean(req.query?.type, 80).toLowerCase();
  const number = Number(req.query?.number);
  const limit = Math.max(1, Math.min(12, Number(req.query?.limit) || 5));
  const firestore = getProblemBankFirestore();

  if (req.query?.staged === "1") {
    try {
      const payload = await stagedPayload(firestore, sessionKey);
      if (!payload) return res.status(404).json({ error: "staged-payload-not-found" });
      const matches = [];
      for (const source of Array.isArray(payload.sources) ? payload.sources : []) {
        const numbers = Array.isArray(source?.numbers) ? source.numbers.map(Number) : [];
        if (Number.isInteger(number) && number > 0 && !numbers.includes(number)) continue;
        for (const problem of Array.isArray(source?.problems) ? source.problems : []) {
          const problemType = clean(problem?.questionType, 80).toLowerCase();
          if (type && problemType !== type) continue;
          matches.push({ sourceLabel: source?.sourceLabel ?? null, numbers, sourceKeys: Object.keys(source || {}).sort(), problemKeys: Object.keys(problem || {}).sort(), problem });
          if (matches.length >= limit) break;
        }
        if (matches.length >= limit) break;
      }
      return res.status(200).json({ sessionKey, datasetId: payload.datasetId ?? null, datasetVersion: payload.datasetVersion ?? null, sourceFileName: payload.sourceFileName ?? null, payloadKeys: Object.keys(payload || {}).sort(), count: matches.length, matches });
    } catch (error) {
      return res.status(500).json({ error: clean(error instanceof Error ? error.message : error, 500) });
    }
  }

  const snapshot = await firestore.collection("problems").where("examId", "==", examId).limit(600).get();
  let docs = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })).filter((problem) => problem.datasetId === DATASET_ID);
  if (type) docs = docs.filter((problem) => clean(problem.questionType, 80).toLowerCase() === type);
  if (Number.isInteger(number) && number > 0) docs = docs.filter((problem) => Number(problem.examQuestionNumber) === number);
  const results = docs.slice(0, limit).map((problem) => ({
    id: problem.questionId || problem.id,
    type: problem.questionType,
    examQuestionNumber: problem.examQuestionNumber,
    sourcePassageLabel: problem.sourcePassageLabel,
    sourcePageNumber: problem.sourcePageNumber,
    passage: clean(problem.passage),
    question: clean(problem.question, 4000),
    choices: Array.isArray(problem.choices) ? problem.choices.map((choice) => clean(choice, 2000)) : [],
    answer: problem.answer ?? null,
    explanation: clean(problem.explanation, 12000),
    emphasisRanges: Array.isArray(problem.emphasisRanges) ? problem.emphasisRanges : [],
    formattingVersion: problem.formattingVersion || null,
    formattingBackfillMethod: problem.formattingBackfillMethod || null,
    fields: Object.keys(problem).sort(),
    metadata: problem.metadata ?? null,
    validation: problem.validation ?? null,
    generator: problem.generator ?? null,
  }));
  return res.status(200).json({ examId, type: type || null, number: Number.isInteger(number) ? number : null, count: results.length, results });
}
