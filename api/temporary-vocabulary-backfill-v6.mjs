import crypto from "node:crypto";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const TOKEN = "xuv6_20260901_t7Wc5mK2";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const FORMATTING_VERSION = "emphasis-backfill-v6-choice-marker-exact";
const SESSIONS = [
  [1, 2025, 3], [1, 2025, 6], [1, 2025, 9], [1, 2025, 10], [1, 2026, 3], [1, 2026, 6],
  [2, 2025, 3], [2, 2025, 6], [2, 2025, 9], [2, 2025, 10], [2, 2026, 3], [2, 2026, 6],
];
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const LEXICAL = /^[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*$/u;

function clean(value, max = 30000) {
  return String(value ?? "").normalize("NFC").replace(/\u0000/gu, "").trim().slice(0, max);
}
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function stripChoice(value, index) {
  let result = clean(value, 500).replace(/\s+/gu, " ");
  const marker = CIRCLED[index - 1];
  if (marker && result.startsWith(marker)) result = result.slice(marker.length).trimStart();
  return result.replace(new RegExp(`^\\(?${index}\\)?[.)]?\\s*`, "u"), "").trim();
}
function existingRanges(problem) {
  return Array.isArray(problem?.emphasisRanges)
    ? problem.emphasisRanges.filter((range) => range?.target === "passage" && Number.isInteger(Number(range.start)) && Number.isInteger(Number(range.end)) && Number(range.end) > Number(range.start))
    : [];
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
function derive(problem) {
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
async function processSession(firestore, grade, year, month, execute) {
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
    if (existingRanges(problem).length) { stats.existing += 1; continue; }
    const ranges = derive(problem);
    if (!ranges) {
      stats.unresolved += 1;
      unresolved.push({ id: problem.questionId || doc.id, number: problem.examQuestionNumber, choices: Array.isArray(problem.choices) ? problem.choices : [] });
      continue;
    }
    stats.recoverable += 1;
    writes.push({ ref: doc.ref, data: {
      emphasisRanges: ranges,
      formattingVersion: FORMATTING_VERSION,
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
  return { ...stats, unresolvedItems: unresolved.slice(0, 50) };
}
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "method-not-allowed" });
  if (clean(req.query?.token, 100) !== TOKEN) return res.status(404).json({ error: "not-found" });
  const execute = req.query?.execute === "1";
  try {
    const firestore = getProblemBankFirestore();
    const sessions = [];
    for (const args of SESSIONS) sessions.push(await processSession(firestore, ...args, execute));
    const totals = sessions.reduce((acc, item) => {
      for (const key of ["total", "existing", "recoverable", "unresolved", "updated"]) acc[key] += item[key];
      return acc;
    }, { total: 0, existing: 0, recoverable: 0, unresolved: 0, updated: 0 });
    return res.status(200).json({ execute, datasetId: DATASET_ID, formattingVersion: FORMATTING_VERSION, totals, sessions });
  } catch (error) {
    console.error("[vocabulary-backfill-v6]", error);
    return res.status(500).json({ error: clean(error instanceof Error ? error.message : error, 500) });
  }
}
