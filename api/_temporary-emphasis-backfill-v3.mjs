import crypto from "node:crypto";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";

const BACKFILL_TOKEN = "xubf3_20260901_F7kQ2r9Lm4";
const DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const FORMATTING_VERSION = "emphasis-backfill-v3-source-aligned";
const TARGET_TYPES = new Set(["grammar", "vocabulary", "implied_meaning"]);
const SESSIONS = [
  [1, 2025, 3], [1, 2025, 6], [1, 2025, 9], [1, 2025, 10], [1, 2026, 3], [1, 2026, 6],
  [2, 2025, 3], [2, 2025, 6], [2, 2025, 9], [2, 2025, 10], [2, 2026, 3], [2, 2026, 6],
];
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const PAGE_LABEL = /\s*Xtudy Universe(?:\s*[|·]\s*|\s+)고[1-3]\s+\d{4}년\s+0?\d{1,2}월(?:\s+모의고사)?\s+11유형\s+변형문제(?:\s+\d+)?\s*$/iu;

function text(value, max = 50_000) {
  return String(value ?? "").normalize("NFC").replace(/\u0000/gu, "").trim().slice(0, max);
}

function compact(value, max = 50_000) {
  return text(value, max).replace(/[\t\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function flexiblePattern(value) {
  const tokens = compact(value, 2_000).split(/\s+/u).filter(Boolean);
  if (!tokens.length) return null;
  return new RegExp(tokens.map(escapeRegExp).join("\\s+"), "u");
}

function findFlexibleRange(source, candidate, from = 0, to = source.length) {
  const pattern = flexiblePattern(candidate);
  if (!pattern) return null;
  const segment = source.slice(Math.max(0, from), Math.min(source.length, to));
  const match = pattern.exec(segment);
  if (!match || match.index === undefined) return null;
  const start = Math.max(0, from) + match.index;
  return { start, end: start + match[0].length };
}

function stripChoicePrefix(value, index) {
  let result = compact(value, 2_000).replace(PAGE_LABEL, "").trim();
  const marker = CIRCLED[index - 1];
  if (marker && result.startsWith(marker)) result = result.slice(marker.length).trimStart();
  result = result.replace(new RegExp(`^\\(?${index}\\)?[.)]?\\s+`, "u"), "").trim();
  return result;
}

function normalizeRanges(ranges, passageLength) {
  const byKey = new Map();
  for (const range of ranges) {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > passageLength) continue;
    const style = range?.style === "underline" ? "underline" : "bold";
    const key = `${start}:${end}:${style}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        target: "passage",
        start,
        end,
        style,
        source: compact(range?.source, 100) || "backfill-v3",
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

function existingRanges(problem, passageLength) {
  if (!Array.isArray(problem?.emphasisRanges)) return [];
  return normalizeRanges(problem.emphasisRanges.filter((range) => range?.target === "passage"), passageLength);
}

function extractTrailingCandidateEcho(rawPassage) {
  const matches = [...rawPassage.matchAll(/[①②③④⑤]/gu)];
  if (matches.length < 10) return null;
  for (let tailStart = matches.length - 5; tailStart >= Math.max(0, matches.length - 12); tailStart -= 1) {
    const tail = matches.slice(tailStart, tailStart + 5);
    if (tail.length !== 5 || tail.map((item) => item[0]).join("") !== "①②③④⑤") continue;
    const passage = rawPassage.slice(0, Number(tail[0].index)).trimEnd();
    const candidates = tail.map((marker, offset) => {
      const start = Number(marker.index) + marker[0].length;
      const end = offset + 1 < tail.length ? Number(tail[offset + 1].index) : rawPassage.length;
      return compact(rawPassage.slice(start, end).replace(PAGE_LABEL, ""), 2_000);
    });
    if (candidates.some((candidate) => !candidate || candidate.length > 220)) continue;
    let matched = 0;
    candidates.forEach((candidate, index) => {
      const marker = CIRCLED[index];
      const markerMatches = [...passage.matchAll(new RegExp(escapeRegExp(marker), "gu"))];
      if (markerMatches.some((item) => {
        const markerEnd = Number(item.index) + marker.length;
        const found = findFlexibleRange(passage, candidate, markerEnd, Math.min(passage.length, markerEnd + candidate.length + 80));
        return found && /^\s*$/u.test(passage.slice(markerEnd, found.start));
      })) matched += 1;
    });
    if (matched >= 4) return { passage, candidates };
  }
  return null;
}

function inlineCandidateRanges(problem, rawPassage) {
  const echoed = extractTrailingCandidateEcho(rawPassage);
  const mainPassage = echoed?.passage ?? rawPassage;
  let candidates = echoed?.candidates ?? [];
  if (candidates.length !== 5 && Array.isArray(problem.choices) && problem.choices.length >= 5) {
    const fromChoices = problem.choices.slice(0, 5).map((choice, offset) => stripChoicePrefix(choice, offset + 1));
    if (fromChoices.every((candidate) => candidate && !CIRCLED.includes(candidate) && candidate.length <= 220)) candidates = fromChoices;
  }
  if (candidates.length !== 5) return { passage: mainPassage, ranges: [], method: "unresolved" };

  const ranges = [];
  for (let index = 0; index < 5; index += 1) {
    const marker = CIRCLED[index];
    const candidate = candidates[index];
    const markerMatches = [...mainPassage.matchAll(new RegExp(escapeRegExp(marker), "gu"))];
    const exact = [];
    for (const markerMatch of markerMatches) {
      const markerEnd = Number(markerMatch.index) + marker.length;
      const found = findFlexibleRange(mainPassage, candidate, markerEnd, Math.min(mainPassage.length, markerEnd + candidate.length + 120));
      if (!found) continue;
      if (!/^\s*$/u.test(mainPassage.slice(markerEnd, found.start))) continue;
      exact.push(found);
    }
    if (exact.length !== 1) return { passage: mainPassage, ranges: [], method: "unresolved" };
    ranges.push({ target: "passage", ...exact[0], style: "bold", source: echoed ? "source-echo-exact" : "choice-exact-v3" });
  }
  return { passage: mainPassage, ranges: normalizeRanges(ranges, mainPassage.length), method: echoed ? "source-echo-exact" : "choice-exact-v3" };
}

function explanationTarget(explanation) {
  const source = text(explanation, 12_000);
  const quotedPatterns = [
    /(?:굵게\s*표시된|굵은\s*글씨로\s*강조된|굵게\s*표시한|밑줄\s*친|밑줄\s*표시된)\s*[“"'‘]([^”"'’]{2,260})[”"'’]/u,
    /(?:표현|구절)\s*[“"'‘]([^”"'’]{2,260})[”"'’]\s*(?:은|는|이|가|을|를)/u,
  ];
  for (const pattern of quotedPatterns) {
    const candidate = pattern.exec(source)?.[1]?.trim();
    if (candidate) return candidate;
  }
  const prefixes = ["굵게 표시된", "굵은 글씨로 강조된", "굵게 표시한", "밑줄 친", "밑줄 표시된"];
  for (const prefix of prefixes) {
    const index = source.indexOf(prefix);
    if (index < 0) continue;
    let tail = source.slice(index + prefix.length).trimStart();
    tail = tail.replace(/^[“"'‘]+/u, "");
    const koreanIndex = tail.search(/[가-힣]/u);
    if (koreanIndex >= 2 && koreanIndex <= 260) {
      const candidate = tail.slice(0, koreanIndex).replace(/[”"'’\s,;:]+$/u, "").trim();
      if (candidate.length >= 2) return candidate;
    }
  }
  return "";
}

function impliedRanges(problem, rawPassage) {
  const candidate = explanationTarget(problem.explanation);
  if (!candidate) return { passage: rawPassage, ranges: [], method: "unresolved" };
  const found = findFlexibleRange(rawPassage, candidate);
  if (!found) return { passage: rawPassage, ranges: [], method: "unresolved" };
  return {
    passage: rawPassage,
    ranges: normalizeRanges([{ target: "passage", ...found, style: "bold", source: "source-explanation-exact-v3" }], rawPassage.length),
    method: "source-explanation-exact-v3",
  };
}

function derive(problem) {
  const rawPassage = text(problem.passage, 30_000);
  const type = compact(problem.questionType, 80).toLowerCase();
  if (!TARGET_TYPES.has(type) || !rawPassage) return { passage: rawPassage, ranges: [], method: "not-target" };

  const stored = existingRanges(problem, rawPassage.length);
  if (stored.length) return { passage: rawPassage, ranges: stored, method: "existing" };
  if (type === "implied_meaning") return impliedRanges(problem, rawPassage);
  return inlineCandidateRanges(problem, rawPassage);
}

async function processSession(firestore, grade, year, month, execute) {
  const examId = `exam_english_g${grade}_${year}_${String(month).padStart(2, "0")}`;
  const snapshot = await firestore.collection("problems").where("examId", "==", examId).limit(600).get();
  const docs = snapshot.docs.filter((doc) => {
    const data = doc.data() || {};
    return data.datasetId === DATASET_ID && TARGET_TYPES.has(compact(data.questionType, 80).toLowerCase());
  });

  const stats = {
    grade, year, month, examId,
    total: docs.length, existing: 0, sourceEchoExact: 0, choiceExact: 0,
    explanationExact: 0, unresolved: 0, updated: 0,
  };
  const unresolved = [];
  const writes = [];

  for (const doc of docs) {
    const problem = doc.data() || {};
    const derived = derive(problem);
    if (derived.method === "existing") stats.existing += 1;
    else if (derived.method === "source-echo-exact") stats.sourceEchoExact += 1;
    else if (derived.method === "choice-exact-v3") stats.choiceExact += 1;
    else if (derived.method === "source-explanation-exact-v3") stats.explanationExact += 1;
    else {
      stats.unresolved += 1;
      unresolved.push({
        id: problem.questionId || doc.id,
        type: compact(problem.questionType, 80),
        sourcePageNumber: Number(problem.sourcePageNumber) || null,
        sourcePassageLabel: compact(problem.sourcePassageLabel, 30) || null,
      });
      continue;
    }

    if (derived.method !== "existing" && derived.ranges.length) {
      const ranges = derived.ranges;
      writes.push({
        ref: doc.ref,
        data: {
          emphasisRanges: ranges,
          formattingVersion: FORMATTING_VERSION,
          formattingFingerprint: hash(JSON.stringify({ passage: derived.passage, ranges })),
          formattingBackfilledAt: new Date(),
          formattingBackfillMethod: derived.method,
        },
      });
    }
  }

  if (execute && writes.length) {
    for (let offset = 0; offset < writes.length; offset += 400) {
      const batch = firestore.batch();
      const chunk = writes.slice(offset, offset + 400);
      for (const write of chunk) batch.set(write.ref, write.data, { merge: true });
      await batch.commit();
      stats.updated += chunk.length;
    }
  }

  return { ...stats, unresolvedItems: unresolved.slice(0, 80) };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "method-not-allowed" });
  if (compact(req.query?.token, 100) !== BACKFILL_TOKEN) return res.status(404).json({ error: "not-found" });
  const execute = req.query?.execute === "1";

  try {
    const firestore = getProblemBankFirestore();
    const sessions = [];
    for (const [grade, year, month] of SESSIONS) {
      sessions.push(await processSession(firestore, grade, year, month, execute));
    }
    const totals = sessions.reduce((acc, item) => {
      for (const key of ["total", "existing", "sourceEchoExact", "choiceExact", "explanationExact", "unresolved", "updated"]) {
        acc[key] += item[key];
      }
      return acc;
    }, { total: 0, existing: 0, sourceEchoExact: 0, choiceExact: 0, explanationExact: 0, unresolved: 0, updated: 0 });
    return res.status(200).json({ execute, datasetId: DATASET_ID, formattingVersion: FORMATTING_VERSION, totals, sessions });
  } catch (error) {
    console.error("[temporary-emphasis-backfill-v3]", error);
    return res.status(500).json({ error: compact(error instanceof Error ? error.message : error, 500) });
  }
}
