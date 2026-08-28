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

function clean(value, max = 500) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max);
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
    if (req.method === "GET" && req.query?.action === "bank-audit") {
      if (process.env.VERCEL_ENV !== "preview") return res.status(404).json({ error: "not-found" });
      return res.status(200).json({ sessions: await previewAudit() });
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
    const questions = chosen.map((key, indexValue) => ({
      ...problemBankProblemToLocalQuestion(index.get(key), indexValue + 1),
      sequence: indexValue + 1,
    }));
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
