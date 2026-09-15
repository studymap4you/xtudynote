import crypto from "node:crypto";
import { assertTrustedOrigin, parseBody, requirePremiumBillingUser } from "./_lib/billing/admin.mjs";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";
import { problemBankProblemToLocalQuestion } from "./_lib/problem-bank/client.mjs";

const SERIES = Object.freeze({
  ebs_special_lecture_2027_er_v2: {
    category: "ebs_special_lecture",
    title: "2027 EBS 수능특강 영어독해연습 Variant 2",
    target: "고3 영어 · 수능특강",
  },
  ebs_complete_2027_v2: {
    category: "ebs_complete",
    title: "2027 EBS 수능완성 영어 Variant 2",
    target: "고3 영어 · 수능완성",
  },
});

const TYPE_ALIASES = new Map([
  ["grammar", "grammar"], ["어법", "grammar"],
  ["topic", "topic"], ["주제", "topic"],
  ["title", "title"], ["제목", "title"],
  ["vocabulary", "vocabulary"], ["vocab", "vocabulary"], ["어휘", "vocabulary"],
  ["implied_meaning", "implied_meaning"], ["implication", "implied_meaning"], ["함축의미", "implied_meaning"], ["함축의미추론", "implied_meaning"],
  ["summary", "summary"], ["요약", "summary"], ["요약문완성", "summary"],
  ["blank", "blank_inference"], ["blank_inference", "blank_inference"], ["빈칸", "blank_inference"], ["빈칸추론", "blank_inference"],
  ["paragraph_order", "paragraph_order"], ["order", "paragraph_order"], ["문장의 순서", "paragraph_order"], ["순서", "paragraph_order"],
  ["sentence_insertion", "sentence_insertion"], ["insertion", "sentence_insertion"], ["문장삽입", "sentence_insertion"],
  ["irrelevant_sentence", "irrelevant_sentence"], ["irrelevant", "irrelevant_sentence"], ["전체 흐름과 무관한 문장", "irrelevant_sentence"], ["글의 흐름", "irrelevant_sentence"],
  ["factual_description", "factual_description"], ["content", "factual_description"], ["내용일치", "factual_description"], ["내용과 일치하지 않는 것", "factual_description"],
]);

const TYPE_LABELS = Object.freeze({
  grammar: "어법",
  topic: "주제",
  title: "제목",
  vocabulary: "어휘",
  implied_meaning: "함축 의미추론",
  summary: "요약문 완성",
  blank_inference: "빈칸추론",
  paragraph_order: "문장의 순서",
  sentence_insertion: "문장삽입",
  irrelevant_sentence: "글의 흐름",
  factual_description: "내용일치",
});

const TYPE_ORDER = Object.freeze([
  "grammar", "topic", "title", "vocabulary", "implied_meaning", "summary",
  "blank_inference", "paragraph_order", "sentence_insertion", "irrelevant_sentence", "factual_description",
]);

function clean(value, max = 1_000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max);
}

function safeInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function serialized(snapshot) {
  const data = snapshot.data?.() || snapshot || {};
  return { ...data, questionId: clean(data.questionId || snapshot.id, 180) };
}

function typeFrom(problem) {
  const candidates = [problem.questionType, problem.variantType, problem.type, problem.typeName];
  for (const candidate of candidates) {
    const raw = clean(candidate, 100).toLowerCase();
    const normalized = TYPE_ALIASES.get(raw);
    if (normalized) return normalized;
  }
  return "";
}

function groupIdFrom(problem) {
  return clean(problem.curriculumGroup || problem.batch || problem.groupId || problem.sourceMetadata?.groupId, 160) || "other";
}

function groupLabelFrom(problem) {
  return clean(problem.curriculumGroupLabel || problem.batchLabel || problem.groupLabel || problem.curriculumGroup || problem.batch, 180) || "기타";
}

function sourceIdFrom(problem) {
  return clean(problem.canonicalSourceId || problem.sourceId || problem.sourceMetadata?.canonicalSourceId, 220);
}

function sourceLabelFrom(problem) {
  return clean(problem.sourceLabel || problem.displayLabel || problem.sourceMetadata?.sourceLabel || sourceIdFrom(problem), 220);
}

function inferredOrder(label) {
  const numbers = clean(label, 220).match(/\d+/gu)?.map(Number) || [];
  if (!numbers.length) return 999999;
  return numbers.reduce((value, number) => value * 1000 + number, 0);
}

function groupOrderFrom(problem) {
  return safeInt(problem.curriculumGroupOrder ?? problem.groupOrder ?? problem.sourceMetadata?.groupOrder, inferredOrder(groupLabelFrom(problem)));
}

function sourceOrderFrom(problem) {
  return safeInt(problem.curriculumSourceOrder ?? problem.sourceOrder ?? problem.sourceMetadata?.sourceOrder, inferredOrder(sourceLabelFrom(problem)));
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

function seriesConfig(seriesId) {
  const config = SERIES[seriesId];
  if (!config) throw Object.assign(new Error("series-invalid"), { statusCode: 400 });
  return config;
}

async function matchingProblems(seriesId) {
  seriesConfig(seriesId);
  const firestore = getProblemBankFirestore();
  const snapshots = await Promise.allSettled([
    firestore.collection("problems").where("curriculumSeries", "==", seriesId).limit(5000).get(),
    firestore.collection("problems").where("metadata.curriculumSeries", "==", seriesId).limit(5000).get(),
  ]);
  const byId = new Map();
  for (const result of snapshots) {
    if (result.status !== "fulfilled") continue;
    for (const doc of result.value.docs) {
      const problem = serialized(doc);
      if (problem.questionId) byId.set(problem.questionId, problem);
    }
  }
  return [...byId.values()].filter((problem) => {
    const status = clean(problem.status, 30).toLowerCase();
    return ["approved", "gold", "published"].includes(status) && typeFrom(problem) && sourceIdFrom(problem);
  });
}

function compareProblems(left, right) {
  const groupDiff = groupOrderFrom(left) - groupOrderFrom(right);
  if (groupDiff) return groupDiff;
  const sourceDiff = sourceOrderFrom(left) - sourceOrderFrom(right);
  if (sourceDiff) return sourceDiff;
  const typeDiff = TYPE_ORDER.indexOf(typeFrom(left)) - TYPE_ORDER.indexOf(typeFrom(right));
  if (typeDiff) return typeDiff;
  return clean(left.questionId, 180).localeCompare(clean(right.questionId, 180), "ko");
}

function availability(problems) {
  return [...problems].sort(compareProblems).map((problem) => {
    const variantType = typeFrom(problem);
    return {
      key: clean(problem.questionId, 180),
      questionId: clean(problem.questionId, 180),
      groupId: groupIdFrom(problem),
      groupLabel: groupLabelFrom(problem),
      groupOrder: groupOrderFrom(problem),
      sourceId: sourceIdFrom(problem),
      sourceLabel: sourceLabelFrom(problem),
      sourceOrder: sourceOrderFrom(problem),
      variantType,
      label: TYPE_LABELS[variantType] || variantType,
      variantIndex: Math.max(1, safeInt(problem.variantIndex, 1)),
      sourcePage: safeInt(problem.sourcePage ?? problem.page, 0) || undefined,
    };
  });
}

function shuffled(values) {
  return [...values].map((value) => ({ value, order: crypto.randomBytes(8).readBigUInt64BE() }))
    .sort((left, right) => left.order < right.order ? -1 : left.order > right.order ? 1 : 0)
    .map((item) => item.value);
}

function errorCode(error) {
  const message = clean(error instanceof Error ? error.message : error, 300);
  if (message.includes("permission-denied") || message.includes("PERMISSION_DENIED")) return "problem-bank-permission-denied";
  return message || "request-failed";
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });
    assertTrustedOrigin(req);
    await requirePremiumBillingUser(req);
    const body = parseBody(req);
    const seriesId = clean(body.seriesId, 160);
    const config = seriesConfig(seriesId);
    const problems = await matchingProblems(seriesId);

    if (body.action === "availability") {
      return res.status(200).json({
        series: { id: seriesId, ...config },
        items: availability(problems),
        totalCount: problems.length,
      });
    }
    if (body.action !== "build") return res.status(400).json({ error: "action-invalid" });

    const byId = new Map(problems.map((problem) => [clean(problem.questionId, 180), problem]));
    const selections = [...new Set(Array.isArray(body.selections)
      ? body.selections.map((item) => clean(item, 180)).filter(Boolean)
      : [])];
    if (!selections.length) return res.status(400).json({ error: "selection-empty" });
    if (selections.some((questionId) => !byId.has(questionId))) {
      return res.status(409).json({ error: "selection-unavailable" });
    }
    const targetCount = Number(body.targetCount);
    if (!Number.isInteger(targetCount) || targetCount < 1) return res.status(400).json({ error: "target-count-invalid" });
    if (targetCount > selections.length) return res.status(409).json({ error: "target-count-exceeds-selection" });

    const chosenProblems = shuffled(selections).slice(0, targetCount)
      .map((questionId) => byId.get(questionId))
      .filter(Boolean)
      .sort(compareProblems);
    const questions = chosenProblems.map((problem, index) => ({
      ...problemBankProblemToLocalQuestion(problem, index + 1),
      emphasisRanges: emphasisRangesFrom(problem),
      sequence: index + 1,
    }));

    return res.status(200).json({
      questions,
      selectedCount: selections.length,
      outputCount: questions.length,
      excludedCount: selections.length - questions.length,
    });
  } catch (error) {
    console.error("[curriculum-variant-workbook]", error);
    return res.status(Number(error?.statusCode) || 500).json({ error: errorCode(error) });
  }
}
