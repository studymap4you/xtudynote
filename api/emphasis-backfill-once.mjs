import crypto from "node:crypto";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const BACKFILL_TOKEN = "xubf_20260901_1441_7Hd2mPq9";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const FORMATTING_VERSION = "emphasis-backfill-v2";
const TARGET_TYPES = new Set(["grammar", "vocabulary", "implied_meaning"]);
const SESSIONS = [
  [1, 2025, 3], [1, 2025, 6], [1, 2025, 9], [1, 2025, 10], [1, 2026, 3], [1, 2026, 6],
  [2, 2025, 3], [2, 2025, 6], [2, 2025, 9], [2, 2025, 10], [2, 2026, 3], [2, 2026, 6],
];
const CIRCLED = ["①", "②", "③", "④", "⑤"];

function clean(value, max = 50_000) {
  return String(value ?? "").normalize("NFC").replace(/\u0000/gu, " ").replace(/[\t\r\n]+/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function stripChoicePrefix(value, index) {
  let text = clean(value, 2_000);
  const circled = CIRCLED[index - 1];
  if (circled && text.startsWith(circled)) text = text.slice(circled.length).trimStart();
  return text.replace(new RegExp(`^\\(?${index}\\)?[.)]?\\s+`, "u"), "").trim();
}

function normalizeRanges(ranges, passageLength) {
  const byKey = new Map();
  for (const range of ranges) {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > passageLength) continue;
    const style = ["bold", "underline"].includes(range?.style) ? range.style : "bold";
    const key = `${start}:${end}:${style}`;
    if (!byKey.has(key)) byKey.set(key, { target: "passage", start, end, style, source: clean(range?.source, 80) || "backfill" });
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

function existingRanges(problem, passageLength) {
  if (!Array.isArray(problem?.emphasisRanges)) return [];
  return normalizeRanges(problem.emphasisRanges.filter((range) => range?.target === "passage"), passageLength);
}

function structuralRanges(problem, passage) {
  if (!["grammar", "vocabulary"].includes(clean(problem.questionType, 80).toLowerCase())) return [];
  if (!Array.isArray(problem.choices) || problem.choices.length < 5) return [];
  const ranges = [];
  let cursor = 0;
  problem.choices.slice(0, 5).forEach((choice, offset) => {
    const candidate = stripChoicePrefix(choice, offset + 1);
    if (!candidate || CIRCLED.includes(candidate) || candidate.length > 180) return;
    const marker = CIRCLED[offset];
    const markerIndex = passage.indexOf(marker, cursor);
    const searchFrom = markerIndex >= 0 ? markerIndex + marker.length : cursor;
    const start = passage.indexOf(candidate, Math.max(0, searchFrom));
    if (start < 0) return;
    if (markerIndex >= 0) {
      const between = passage.slice(markerIndex + marker.length, start);
      if (!/^\s*$/u.test(between) || between.length > 4) return;
    }
    ranges.push({ target: "passage", start, end: start + candidate.length, style: "bold", source: "backfill-choice-exact" });
    cursor = start + candidate.length;
  });
  return ranges.length === 5 ? ranges : [];
}

function impliedRange(problem, passage) {
  const explanation = clean(problem.explanation, 12_000);
  const patterns = [
    /(?:굵게\s*표시된|굵은\s*글씨로\s*강조된|굵게\s*표시한|밑줄\s*친|밑줄\s*표시된)\s*[“"']([^”"']{2,240})[”"']/u,
    /(?:표현|구절)\s*[“"']([^”"']{2,240})[”"']\s*(?:은|는|이|가)/u,
  ];
  for (const pattern of patterns) {
    const target = explanation.match(pattern)?.[1]?.trim();
    if (!target) continue;
    const start = passage.indexOf(target);
    if (start >= 0) return [{ target: "passage", start, end: start + target.length, style: "bold", source: "backfill-explanation-exact" }];
  }
  return [];
}

function conservativeMarkerRanges(problem, passage) {
  const type = clean(problem.questionType, 80).toLowerCase();
  if (!["grammar", "vocabulary"].includes(type)) return [];
  const markers = CIRCLED.map((marker) => passage.indexOf(marker));
  if (markers.some((index) => index < 0)) return [];
  const ranges = [];
  for (let i = 0; i < markers.length; i += 1) {
    const start0 = markers[i] + CIRCLED[i].length;
    const endLimit = i + 1 < markers.length ? markers[i + 1] : passage.length;
    const segmentRaw = passage.slice(start0, endLimit);
    const segment = segmentRaw.trimStart();
    const leadingWhitespace = segmentRaw.length - segment.length;
    const start = start0 + leadingWhitespace;
    if (!segment) continue;
    const punctuation = segment.search(/[,;:.!?—–-]/u);
    const wordTokens = [...segment.matchAll(/\S+/gu)];
    let candidateEnd = punctuation > 0 ? punctuation : segment.length;
    if (wordTokens.length >= 6) candidateEnd = Math.min(candidateEnd, Number(wordTokens[5].index));
    if (candidateEnd <= 0 && wordTokens.length) {
      const token = wordTokens[Math.min(2, wordTokens.length - 1)];
      candidateEnd = Number(token.index) + token[0].length;
    }
    const text = segment.slice(0, candidateEnd).trimEnd();
    if (!text) continue;
    ranges.push({ target: "passage", start, end: start + text.length, style: "bold", source: "backfill-marker-fallback" });
  }
  return ranges.length === 5 ? ranges : [];
}

function derive(problem) {
  const passage = clean(problem.passage, 30_000);
  const type = clean(problem.questionType, 80).toLowerCase();
  if (!TARGET_TYPES.has(type) || !passage) return { ranges: [], method: "not-target" };
  const stored = existingRanges(problem, passage.length);
  if (stored.length) return { ranges: stored, method: "existing" };
  if (type === "implied_meaning") {
    const exact = impliedRange(problem, passage);
    return exact.length ? { ranges: exact, method: "explanation-exact" } : { ranges: [], method: "unresolved" };
  }
  const exact = structuralRanges(problem, passage);
  if (exact.length === 5) return { ranges: normalizeRanges(exact, passage.length), method: "choice-exact" };
  const fallback = conservativeMarkerRanges(problem, passage);
  if (fallback.length === 5) return { ranges: normalizeRanges(fallback, passage.length), method: "marker-fallback" };
  return { ranges: [], method: "unresolved" };
}

async function processSession(firestore, grade, year, month, execute) {
  const examId = `exam_english_g${grade}_${year}_${String(month).padStart(2, "0")}`;
  const snapshot = await firestore.collection("problems").where("examId", "==", examId).limit(600).get();
  const docs = snapshot.docs.filter((doc) => {
    const data = doc.data() || {};
    return data.datasetId === DATASET_ID && TARGET_TYPES.has(clean(data.questionType, 80).toLowerCase());
  });
  const stats = { grade, year, month, examId, total: docs.length, existing: 0, choiceExact: 0, explanationExact: 0, markerFallback: 0, unresolved: 0, updated: 0 };
  const unresolved = [];
  const writes = [];
  for (const doc of docs) {
    const problem = doc.data() || {};
    const derived = derive(problem);
    if (derived.method === "existing") stats.existing += 1;
    else if (derived.method === "choice-exact") stats.choiceExact += 1;
    else if (derived.method === "explanation-exact") stats.explanationExact += 1;
    else if (derived.method === "marker-fallback") stats.markerFallback += 1;
    else {
      stats.unresolved += 1;
      unresolved.push(problem.questionId || doc.id);
      continue;
    }
    if (derived.method !== "existing" && derived.ranges.length) {
      const passage = clean(problem.passage, 30_000);
      writes.push({ ref: doc.ref, data: {
        emphasisRanges: derived.ranges,
        formattingVersion: FORMATTING_VERSION,
        formattingFingerprint: hash(JSON.stringify({ passage, ranges: derived.ranges })),
        formattingBackfilledAt: new Date(),
        formattingBackfillMethod: derived.method,
      } });
    }
  }
  if (execute && writes.length) {
    for (let offset = 0; offset < writes.length; offset += 400) {
      const batch = firestore.batch();
      for (const write of writes.slice(offset, offset + 400)) batch.set(write.ref, write.data, { merge: true });
      await batch.commit();
      stats.updated += Math.min(400, writes.length - offset);
    }
  }
  return { ...stats, unresolvedIds: unresolved.slice(0, 25) };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "method-not-allowed" });
  if (clean(req.query?.token, 100) !== BACKFILL_TOKEN) return res.status(404).json({ error: "not-found" });
  const execute = req.query?.execute === "1";
  try {
    const firestore = getProblemBankFirestore();
    const sessions = [];
    for (const [grade, year, month] of SESSIONS) sessions.push(await processSession(firestore, grade, year, month, execute));
    const totals = sessions.reduce((acc, item) => {
      for (const key of ["total", "existing", "choiceExact", "explanationExact", "markerFallback", "unresolved", "updated"]) acc[key] += item[key];
      return acc;
    }, { total: 0, existing: 0, choiceExact: 0, explanationExact: 0, markerFallback: 0, unresolved: 0, updated: 0 });
    return res.status(200).json({ execute, datasetId: DATASET_ID, formattingVersion: FORMATTING_VERSION, totals, sessions });
  } catch (error) {
    console.error("[emphasis-backfill-once]", error);
    return res.status(500).json({ error: clean(error instanceof Error ? error.message : error, 300) });
  }
}
