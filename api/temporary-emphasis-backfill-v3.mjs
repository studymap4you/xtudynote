import { brotliDecompressSync } from "node:zlib";
import backfillHandler from "./_temporary-emphasis-backfill-v4.mjs";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN = "xubf3_20260901_F7kQ2r9Lm4";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const STAGING_COLLECTION = "_xtudy_high_school_sync_staging";

function clean(value, max = 30000) {
  return String(value ?? "").normalize("NFC").replace(/\u0000/gu, "").trim().slice(0, max);
}

function sessionParts(value) {
  const match = /^g([12])-(2025|2026)-(03|06|09|10)$/u.exec(clean(value, 40));
  if (!match) return null;
  const [, grade, year, month] = match;
  return { grade: Number(grade), year: Number(year), month: Number(month), sessionKey: clean(value, 40) };
}

async function stagedPayload(firestore, sessionKey) {
  const snapshot = await firestore.collection(STAGING_COLLECTION).where("sessionKey", "==", sessionKey).limit(30).get();
  if (snapshot.empty) return null;
  const chunks = snapshot.docs
    .map((doc) => doc.data() || {})
    .sort((left, right) => Number(left.index) - Number(right.index));
  const total = Number(chunks[0]?.total) || 0;
  if (!total || chunks.length !== total || chunks.some((chunk, index) => Number(chunk.index) !== index || Number(chunk.total) !== total)) {
    throw new Error("staged-payload-incomplete");
  }
  const compressed = Buffer.from(chunks.map((chunk) => clean(chunk.data, 12000)).join(""), "base64url");
  return JSON.parse(brotliDecompressSync(compressed).toString("utf8"));
}

export default async function handler(req, res) {
  if (req.query?.debug !== "1") return backfillHandler(req, res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (clean(req.query?.token, 100) !== TOKEN) return res.status(404).json({ error: "not-found" });
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
          matches.push({
            sourceLabel: source?.sourceLabel ?? null,
            numbers,
            sourceKeys: Object.keys(source || {}).sort(),
            problemKeys: Object.keys(problem || {}).sort(),
            problem,
          });
          if (matches.length >= limit) break;
        }
        if (matches.length >= limit) break;
      }
      return res.status(200).json({
        sessionKey,
        datasetId: payload.datasetId ?? null,
        datasetVersion: payload.datasetVersion ?? null,
        sourceFileName: payload.sourceFileName ?? null,
        payloadKeys: Object.keys(payload || {}).sort(),
        count: matches.length,
        matches,
      });
    } catch (error) {
      return res.status(500).json({ error: clean(error instanceof Error ? error.message : error, 500) });
    }
  }

  const snapshot = await firestore.collection("problems").where("examId", "==", examId).limit(600).get();
  let docs = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .filter((problem) => problem.datasetId === DATASET_ID);
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
    fields: Object.keys(problem).sort(),
    metadata: problem.metadata ?? null,
    validation: problem.validation ?? null,
    generator: problem.generator ?? null,
    sourceMetadata: problem.sourceMetadata ?? null,
    provenance: problem.provenance ?? null,
    raw: problem.raw ?? null,
  }));
  return res.status(200).json({ examId, type: type || null, number: Number.isInteger(number) ? number : null, count: results.length, results });
}
