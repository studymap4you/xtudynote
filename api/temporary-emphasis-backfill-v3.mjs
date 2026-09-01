import backfillHandler from "./_temporary-emphasis-backfill-v4.mjs";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN = "xubf3_20260901_F7kQ2r9Lm4";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";

function clean(value, max = 30000) {
  return String(value ?? "").normalize("NFC").replace(/\u0000/gu, "").trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.query?.debug !== "1") return backfillHandler(req, res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (clean(req.query?.token, 100) !== TOKEN) return res.status(404).json({ error: "not-found" });
  const match = /^g([12])-(2025|2026)-(03|06|09|10)$/u.exec(clean(req.query?.session, 40));
  if (!match) return res.status(400).json({ error: "invalid-session" });
  const [, grade, year, month] = match;
  const examId = `exam_english_g${grade}_${year}_${month}`;
  const type = clean(req.query?.type, 80).toLowerCase();
  const number = Number(req.query?.number);
  const limit = Math.max(1, Math.min(12, Number(req.query?.limit) || 5));
  const firestore = getProblemBankFirestore();
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
    explanation: clean(problem.explanation, 12000),
    emphasisRanges: Array.isArray(problem.emphasisRanges) ? problem.emphasisRanges : [],
    formattingVersion: problem.formattingVersion || null,
  }));
  return res.status(200).json({ examId, type: type || null, number: Number.isInteger(number) ? number : null, count: results.length, results });
}
