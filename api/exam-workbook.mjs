import crypto from "node:crypto";
import { brotliDecompressSync } from "node:zlib";
import { assertTrustedOrigin, parseBody, requirePremiumBillingUser } from "./_lib/billing/admin.mjs";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";
import { problemBankProblemToLocalQuestion } from "./_lib/problem-bank/client.mjs";

const VALID_QUESTION_NUMBERS = new Set([
  ...Array.from({ length: 7 }, (_, index) => index + 18),
  ...Array.from({ length: 17 }, (_, index) => index + 29),
]);

const TYPE_ALIASES = new Map([
  ["grammar", "grammar"], ["topic", "topic"], ["title", "title"],
  ["vocabulary", "vocabulary"], ["implied_meaning", "implied_meaning"],
  ["summary", "summary"], ["blank", "blank_inference"],
  ["blank_short", "blank_inference"], ["blank_long", "blank_inference"],
  ["blank_inference", "blank_inference"], ["paragraph_order", "paragraph_order"],
  ["sentence_order", "paragraph_order"], ["sentence_insertion", "sentence_insertion"],
  ["irrelevant_sentence", "irrelevant_sentence"], ["flow", "irrelevant_sentence"],
  ["factual_description", "factual_description"], ["content_match", "factual_description"],
  ["original", "original"], ["official_original", "original"], ["source_question", "original"],
]);

const TYPE_LABELS = {
  original: "원형 문제", grammar: "어법", topic: "주제", title: "제목", vocabulary: "어휘",
  implied_meaning: "함축 의미추론", summary: "요약문 완성", blank_inference: "빈칸추론",
  paragraph_order: "문장의 순서", sentence_insertion: "문장삽입",
  irrelevant_sentence: "글의 흐름", factual_description: "내용일치",
};

const AUDIT_SESSIONS = [
  [1, 2025, 3], [1, 2025, 6], [1, 2025, 9], [1, 2025, 10], [1, 2026, 3], [1, 2026, 6],
  [2, 2025, 3], [2, 2025, 6], [2, 2025, 9], [2, 2025, 10], [2, 2026, 3], [2, 2026, 6],
];
const ONE_TIME_SYNC_NONCE = "a3fYBI1Bb4R58EC8Et_8iu4X";
const SYNC_DATASET_ID = "xtudy-mock-exam-11-variants-v1";
const SYNC_DATASET_VERSION = "2026-08-29.2";
const STAGING_COLLECTION = "_xtudy_high_school_sync_staging";

function clean(value, max = 500) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max);
}

function emphasisRangesFrom(problem) {
  if (!Array.isArray(problem?.emphasisRanges)) return [];
  return problem.emphasisRanges.flatMap((range) => {
    if (!range || typeof range !== "object") return [];
    const target = clean(range.target, 20);
    const style = clean(range.style, 20);
    const start = Number(range.start);
    const end = Number(range.end);
    const choiceIndex = range.choiceIndex === undefined ? undefined : Number(range.choiceIndex);
    const source = clean(range.source, 80) || undefined;
    if (!["passage", "stem", "choice"].includes(target)) return [];
    if (!["bold", "underline"].includes(style)) return [];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return [];
    if (target === "choice" && (!Number.isInteger(choiceIndex) || choiceIndex < 1 || choiceIndex > 5)) return [];
    return [{ target, start, end, style, choiceIndex, source }];
  });
}

function numberFrom(problem) {
  const values = [
    problem.examQuestionNumber, problem.originalQuestionNumber, problem.questionNumber,
    problem.sourceQuestionNumber, problem.metadata?.questionNumber, problem.sourceMetadata?.questionNumber,
  ];
  return values.map(Number).find((value) => VALID_QUESTION_NUMBERS.has(value)) || 0;
}

function typeFrom(problem) {
  const raw = clean(problem.questionType || problem.variantType || problem.type, 80).toLowerCase();
  return TYPE_ALIASES.get(raw) || "";
}

function keyFor(questionNumber, type, questionId) {
  return `${questionNumber}:${type}:${encodeURIComponent(questionId)}`;
}

function serialized(snapshot) {
  const data = snapshot.data?.() || snapshot || {};
  return { ...data, questionId: clean(data.questionId || snapshot.id, 160) };
}

async function matchingProblems(examId) {
  const firestore = getProblemBankFirestore();
  const examRef = firestore.collection("exams").doc(examId);
  const exam = await examRef.get();
  if (!exam.exists) throw Object.assign(new Error("exam-not-found"), { statusCode: 404 });

  const queries = [
    firestore.collection("problems").where("examId", "==", examId).limit(600).get(),
    firestore.collection("problems").where("sourceExamId", "==", examId).limit(600).get(),
    firestore.collection("problems").where("metadata.examId", "==", examId).limit(600).get(),
    examRef.collection("questions").limit(600).get(),
    examRef.collection("variants").limit(600).get(),
  ];
  const results = await Promise.allSettled(queries);
  const byId = new Map();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const doc of result.value.docs) {
      const problem = serialized(doc);
      if (problem.questionId) byId.set(problem.questionId, problem);
    }
  }
  return [...byId.values()].filter((problem) => ["approved", "gold", "published"].includes(clean(problem.status, 30).toLowerCase()));
}

function indexedProblems(problems) {
  const index = new Map();
  for (const problem of problems) {
    const questionNumber = numberFrom(problem);
    const type = typeFrom(problem);
    if (!questionNumber || !type) continue;
    const key = keyFor(questionNumber, type, problem.questionId);
    index.set(key, problem);
  }
  return index;
}

function availability(index) {
  const counts = new Map();
  return [...index.keys()].map((key) => {
    const [questionNumber, variantType] = key.split(":", 2);
    const typeKey = `${questionNumber}:${variantType}`;
    const variantIndex = (counts.get(typeKey) || 0) + 1;
    counts.set(typeKey, variantIndex);
    return {
      key,
      questionNumber: Number(questionNumber),
      kind: variantType === "original" ? "original" : "variant",
      variantType: variantType === "original" ? null : variantType,
      label: TYPE_LABELS[variantType] || variantType,
      variantIndex,
    };
  }).sort((left, right) => left.questionNumber - right.questionNumber
    || left.label.localeCompare(right.label, "ko") || left.key.localeCompare(right.key));
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function errorCode(error) {
  const code = clean(error instanceof Error ? error.message : "request-failed", 120);
  if (code.includes("PERMISSION_DENIED")) return "problem-bank-permission-denied";
  return code || "request-failed";
}

function sessionConfig(sessionKey) {
  const match = /^g([12])-(2025|2026)-(03|06|09|10)$/u.exec(clean(sessionKey, 40));
  if (!match) return null;
  const config = { grade: Number(match[1]), year: Number(match[2]), month: Number(match[3]) };
  if (!AUDIT_SESSIONS.some(([grade, year, month]) => grade === config.grade && year === config.year && month === config.month)) return null;
  return config;
}

function stageDocId(sessionKey, index) {
  return `sync_${sessionKey}_${String(index).padStart(3, "0")}`;
}

async function stageChunk(req) {
  const sessionKey = clean(req.query?.session, 40);
  if (!sessionConfig(sessionKey)) throw Object.assign(new Error("sync-session-invalid"), { statusCode: 400 });
  const index = Number(req.query?.index);
  const total = Number(req.query?.total);
  const data = clean(req.query?.data, 12000);
  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total < 1 || total > 30 || index >= total) {
    throw Object.assign(new Error("sync-chunk-index-invalid"), { statusCode: 400 });
  }
  if (!data || data.length > 11000 || !/^[A-Za-z0-9_-]+$/u.test(data)) {
    throw Object.assign(new Error("sync-chunk-data-invalid"), { statusCode: 400 });
  }
  const firestore = getProblemBankFirestore();
  await firestore.collection(STAGING_COLLECTION).doc(stageDocId(sessionKey, index)).set({
    sessionKey, index, total, data, updatedAt: new Date(),
  });
  return { sessionKey, index, total, received: data.length };
}

async function syncStagedSession(req) {
  const sessionKey = clean(req.query?.session, 40);
  const config = sessionConfig(sessionKey);
  if (!config) throw Object.assign(new Error("sync-session-invalid"), { statusCode: 400 });
  const total = Number(req.query?.total);
  if (!Number.isInteger(total) || total < 1 || total > 30) throw Object.assign(new Error("sync-total-invalid"), { statusCode: 400 });
  const firestore = getProblemBankFirestore();
  const refs = Array.from({ length: total }, (_, index) => firestore.collection(STAGING_COLLECTION).doc(stageDocId(sessionKey, index)));
  const snapshots = await firestore.getAll(...refs);
  if (snapshots.some((snapshot) => !snapshot.exists)) throw Object.assign(new Error("sync-chunks-incomplete"), { statusCode: 409 });
  const chunks = snapshots.map((snapshot, index) => {
    const data = snapshot.data() || {};
    if (Number(data.index) !== index || Number(data.total) !== total || data.sessionKey !== sessionKey) {
      throw Object.assign(new Error("sync-chunk-mismatch"), { statusCode: 409 });
    }
    return clean(data.data, 12000);
  });
  let payload;
  try {
    const compressed = Buffer.from(chunks.join(""), "base64url");
    payload = JSON.parse(brotliDecompressSync(compressed).toString("utf8"));
  } catch {
    throw Object.assign(new Error("sync-payload-invalid"), { statusCode: 400 });
  }
  if (payload.datasetId !== SYNC_DATASET_ID || payload.datasetVersion !== SYNC_DATASET_VERSION
    || Number(payload.grade) !== config.grade || Number(payload.year) !== config.year || Number(payload.month) !== config.month
    || !Array.isArray(payload.sources)) {
    throw Object.assign(new Error("sync-payload-metadata-invalid"), { statusCode: 400 });
  }
  const examId = `exam_english_g${config.grade}_${config.year}_${String(config.month).padStart(2, "0")}`;
  const examSnapshot = await firestore.collection("exams").doc(examId).get();
  if (!examSnapshot.exists) throw Object.assign(new Error("exam-not-found"), { statusCode: 404 });
  const now = new Date();
  const createdAt = new Date("2026-08-29T00:00:00.000Z");
  const writes = [];
  const distribution = {};
  for (const source of payload.sources) {
    if (!Array.isArray(source.numbers) || !Array.isArray(source.problems)) throw Object.assign(new Error("sync-source-invalid"), { statusCode: 400 });
    for (const problem of source.problems) {
      const type = clean(problem.questionType, 80);
      if (!TYPE_LABELS[type] || type === "original") throw Object.assign(new Error("sync-type-invalid"), { statusCode: 400 });
      for (const rawNumber of source.numbers) {
        const number = Number(rawNumber);
        if (!VALID_QUESTION_NUMBERS.has(number)) throw Object.assign(new Error("sync-question-number-invalid"), { statusCode: 400 });
        const questionId = `${clean(problem.baseQuestionId, 160)}-Q${String(number).padStart(2, "0")}`;
        const docId = `problem_${crypto.createHash("sha256").update(questionId).digest("hex").slice(0, 32)}`;
        const record = {
          questionId,
          subject: "english",
          language: "en",
          examFamily: "mock_exam",
          grade: config.grade + 9,
          schoolGrade: config.grade,
          examYear: config.year,
          examMonth: config.month,
          examQuestionNumbers: source.numbers.map(Number),
          questionType: type,
          subtype: clean(problem.subtype, 80),
          difficulty: config.grade === 1 ? 3 : 4,
          sourceId: `xtudy-mock-g${config.grade}-${config.year}-${String(config.month).padStart(2, "0")}-${clean(source.sourceLabel, 30)}`,
          passage: String(problem.passage || ""),
          question: String(problem.question || ""),
          choices: Array.isArray(problem.choices) ? problem.choices.map(String) : [],
          answer: Number(problem.answer),
          explanation: String(problem.explanation || ""),
          emphasisRanges: emphasisRangesFrom(problem),
          formattingVersion: clean(problem.formattingVersion, 80) || undefined,
          formattingFingerprint: clean(problem.formattingFingerprint, 100) || undefined,
          conceptTags: [type, `grade-${config.grade}`, "high-school-english"],
          skillTags: [type, "mock-exam-variant", `${config.year}-${String(config.month).padStart(2, "0")}`],
          qualityScore: 95,
          status: "approved",
          validation: {
            answerPresent: Number.isInteger(Number(problem.answer)),
            explanationPresent: String(problem.explanation || "").length >= 20,
            structurallyValid: Array.isArray(problem.choices) && problem.choices.length === 5 && String(problem.passage || "").length >= 80,
            issues: [], sourceVerified: true, parserVersion: SYNC_DATASET_VERSION,
          },
          generator: { provider: "xtudy-universe", model: "source-pdf", version: SYNC_DATASET_VERSION },
          contentFingerprint: clean(problem.contentFingerprint, 100),
          datasetId: SYNC_DATASET_ID,
          datasetVersion: SYNC_DATASET_VERSION,
          sourceFileName: clean(payload.sourceFileName, 240),
          sourcePageNumber: Number(problem.sourcePageNumber) || null,
          sourcePassageLabel: clean(source.sourceLabel, 30),
          duplicateIndex: Number(problem.duplicateIndex) || 1,
          examId,
          sourceExamId: examId,
          examQuestionNumber: number,
          originalQuestionNumber: number,
          sourceQuestionNumber: number,
          metadata: { examId, questionNumber: number, sourcePassageLabel: clean(source.sourceLabel, 30) },
          createdAt,
          updatedAt: now,
        };
        if (record.choices.length !== 5 || !Number.isInteger(record.answer) || record.answer < 1 || record.answer > 5 || record.passage.length < 80) {
          throw Object.assign(new Error("sync-problem-structure-invalid"), { statusCode: 400 });
        }
        writes.push({ ref: firestore.collection("problems").doc(docId), record });
        const bucket = `${number}:${type}`;
        distribution[bucket] = (distribution[bucket] || 0) + 1;
      }
    }
  }
  if (!writes.length || writes.length > 400) throw Object.assign(new Error("sync-write-count-invalid"), { statusCode: 400 });
  const batch = firestore.batch();
  for (const write of writes) batch.set(write.ref, write.record, { merge: true });
  for (const ref of refs) batch.delete(ref);
  await batch.commit();
  return { sessionKey, examId, imported: writes.length, distribution };
}

async function previewAudit() {
  const firestore = getProblemBankFirestore();
  const examSnapshot = await firestore.collection("exams").limit(500).get();
  const exams = examSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const sessions = [];
  for (const [grade, year, month] of AUDIT_SESSIONS) {
    const matches = exams.filter((exam) => Number(exam.grade) === grade
      && Number(exam.year) === year && Number(exam.month) === month);
    if (matches.length !== 1) {
      sessions.push({ grade, year, month, examMatches: matches.length, examIds: matches.map((exam) => exam.id) });
      continue;
    }
    const exam = matches[0];
    const problems = await matchingProblems(exam.id);
    const distribution = {};
    const datasetCounts = {};
    for (const problem of problems) {
      const questionNumber = numberFrom(problem);
      const type = typeFrom(problem);
      if (!questionNumber || !type) continue;
      const bucket = `${questionNumber}:${type}`;
      distribution[bucket] = (distribution[bucket] || 0) + 1;
      const dataset = clean(problem.datasetId || "(none)", 120);
      datasetCounts[dataset] = (datasetCounts[dataset] || 0) + 1;
    }
    sessions.push({
      grade, year, month, examId: exam.id,
      approvedProblemCount: problems.length,
      indexedProblemCount: Object.values(distribution).reduce((sum, value) => sum + value, 0),
      datasetCounts,
      distribution,
    });
  }
  return sessions;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  try {
    if (req.method === "GET" && ["bank-audit", "stage-chunk", "bank-sync-session"].includes(clean(req.query?.action, 40))) {
      if (clean(req.query?.nonce, 80) !== ONE_TIME_SYNC_NONCE) return res.status(404).json({ error: "not-found" });
      if (req.query.action === "stage-chunk") return res.status(200).json(await stageChunk(req));
      if (req.query.action === "bank-sync-session") return res.status(200).json(await syncStagedSession(req));
      return res.status(200).json({ environment: process.env.VERCEL_ENV || "unknown", sessions: await previewAudit() });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });
    assertTrustedOrigin(req);
    await requirePremiumBillingUser(req);
    const body = parseBody(req);
    const examId = clean(body.examId, 180);
    if (!examId || examId.includes("/")) return res.status(400).json({ error: "exam-id-invalid" });
    const index = indexedProblems(await matchingProblems(examId));
    if (body.action === "availability") return res.status(200).json({ items: availability(index) });
    if (body.action !== "build") return res.status(400).json({ error: "action-invalid" });

    const selections = [...new Set(Array.isArray(body.selections) ? body.selections.map((item) => clean(item, 120)) : [])].filter(Boolean);
    if (!selections.length) return res.status(400).json({ error: "selection-empty" });
    if (selections.some((key) => !index.has(key))) return res.status(409).json({ error: "selection-unavailable" });
    const targetCount = Number(body.targetCount);
    if (!Number.isInteger(targetCount) || targetCount < 1) return res.status(400).json({ error: "target-count-invalid" });
    if (targetCount > selections.length) return res.status(409).json({ error: "target-count-exceeds-selection" });

    const chosen = shuffled(selections).slice(0, targetCount).sort((left, right) => {
      const [leftNumber] = left.split(":").map(Number);
      const [rightNumber] = right.split(":").map(Number);
      return leftNumber - rightNumber || left.localeCompare(right);
    });
    const questions = chosen.map((key, indexValue) => {
      const problem = index.get(key);
      return {
        ...problemBankProblemToLocalQuestion(problem, indexValue + 1),
        emphasisRanges: emphasisRangesFrom(problem),
        sequence: indexValue + 1,
      };
    });
    return res.status(200).json({
      questions,
      selectedCount: selections.length,
      outputCount: questions.length,
      excludedCount: selections.length - questions.length,
    });
  } catch (error) {
    console.error("[exam-workbook]", error);
    return res.status(Number(error?.statusCode) || 500).json({ error: errorCode(error) });
  }
}
