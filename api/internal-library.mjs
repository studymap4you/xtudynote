import crypto from "node:crypto";
import admin from "firebase-admin";
import { assertTrustedOrigin, parseBody, requirePremiumBillingUser } from "./_lib/billing/admin.mjs";
import { isSuperAdminEmail } from "./_lib/billing/config.mjs";
import { getProblemBankFirestore } from "./_lib/problem-bank/admin.mjs";
import { problemBankProblemToLocalQuestion } from "./_lib/problem-bank/client.mjs";

const CURRICULUM_SERIES = Object.freeze({
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

function ensureFirebaseAdmin() {
  if (admin.apps.length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw === "{}") throw new Error("server-auth-not-configured");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

async function requireAuthenticatedUser(req) {
  ensureFirebaseAdmin();
  const authHeader = String(req.headers?.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!bearer) throw new Error("authentication-required");
  return admin.auth().verifyIdToken(bearer);
}

function sanitizeText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function clean(value, max = 1_000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, max);
}

function sanitizeStringArray(value, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, 1_000))
    .filter(Boolean)
    .slice(0, maxItems);
}

function toMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function normalizeLibraryItem(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    subject: sanitizeText(data.subject, 300),
    identifier: sanitizeText(data.identifier, 300),
    learningTopic: sanitizeText(data.learningTopic, 1_000),
    section: sanitizeText(data.section, 300),
    sourceDatabase: sanitizeText(data.sourceDatabase, 200),
    libraryCategory: ["problem_bank", "source_material"].includes(data.libraryCategory)
      ? data.libraryCategory
      : "problem_bank",
    type: ["share", "paid", "homework"].includes(data.type) ? data.type : "share",
    homeworkCode: data.homeworkCode == null ? null : sanitizeText(data.homeworkCode, 120),
    shortCode: data.shortCode == null ? null : sanitizeText(data.shortCode, 120),
    createdAtMs: toMillis(data.createdAt),
    learningMaterialFilePaths: sanitizeStringArray(data.learningMaterialFilePaths),
    referenceMaterialFilePaths: sanitizeStringArray(data.referenceMaterialFilePaths),
    themes: sanitizeStringArray(data.themes, 30),
  };
}

async function requireActiveSuperAdmin(authUser) {
  const uid = authUser.uid;
  const snapshot = await admin.firestore().doc(`users/${uid}`).get();
  const profile = snapshot.data() || {};
  const email = String(authUser.email || profile.email || "").trim().toLowerCase();
  if (!snapshot.exists || !isSuperAdminEmail(email) || profile.role !== "super_admin" || profile.accountStatus !== "active") {
    throw new Error("admin-access-required");
  }
}

async function listInternalLibrary() {
  const snapshot = await admin
    .firestore()
    .collection("contents")
    .where("status", "==", "internal")
    .limit(1000)
    .get();
  return snapshot.docs
    .map(normalizeLibraryItem)
    .sort((a, b) => b.createdAtMs - a.createdAtMs || a.subject.localeCompare(b.subject, "ko"));
}

function safeInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function serialized(snapshot) {
  const data = snapshot.data?.() || snapshot || {};
  return { ...data, questionId: clean(data.questionId || snapshot.id, 180) };
}

function curriculumTypeFrom(problem) {
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

function curriculumSeriesConfig(seriesId) {
  const config = CURRICULUM_SERIES[seriesId];
  if (!config) throw Object.assign(new Error("series-invalid"), { statusCode: 400 });
  return config;
}

async function matchingCurriculumProblems(seriesId) {
  curriculumSeriesConfig(seriesId);
  const firestore = getProblemBankFirestore();
  const results = await Promise.allSettled([
    firestore.collection("problems").where("curriculumSeries", "==", seriesId).limit(5000).get(),
    firestore.collection("problems").where("metadata.curriculumSeries", "==", seriesId).limit(5000).get(),
  ]);
  const byId = new Map();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const doc of result.value.docs) {
      const problem = serialized(doc);
      if (problem.questionId) byId.set(problem.questionId, problem);
    }
  }
  return [...byId.values()].filter((problem) => {
    const status = clean(problem.status, 30).toLowerCase();
    return ["approved", "gold", "published"].includes(status) && curriculumTypeFrom(problem) && sourceIdFrom(problem);
  });
}

function compareCurriculumProblems(left, right) {
  const groupDiff = groupOrderFrom(left) - groupOrderFrom(right);
  if (groupDiff) return groupDiff;
  const sourceDiff = sourceOrderFrom(left) - sourceOrderFrom(right);
  if (sourceDiff) return sourceDiff;
  const typeDiff = TYPE_ORDER.indexOf(curriculumTypeFrom(left)) - TYPE_ORDER.indexOf(curriculumTypeFrom(right));
  if (typeDiff) return typeDiff;
  return clean(left.questionId, 180).localeCompare(clean(right.questionId, 180), "ko");
}

function curriculumAvailability(problems) {
  return [...problems].sort(compareCurriculumProblems).map((problem) => {
    const variantType = curriculumTypeFrom(problem);
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

async function handleCurriculumVariant(req, res) {
  assertTrustedOrigin(req);
  await requirePremiumBillingUser(req);
  const body = parseBody(req);
  const seriesId = clean(body.seriesId, 160);
  const config = curriculumSeriesConfig(seriesId);
  const problems = await matchingCurriculumProblems(seriesId);

  if (body.action === "availability") {
    res.status(200).json({
      series: { id: seriesId, ...config },
      items: curriculumAvailability(problems),
      totalCount: problems.length,
    });
    return;
  }
  if (body.action !== "build") throw Object.assign(new Error("action-invalid"), { statusCode: 400 });

  const byId = new Map(problems.map((problem) => [clean(problem.questionId, 180), problem]));
  const selections = [...new Set(Array.isArray(body.selections)
    ? body.selections.map((item) => clean(item, 180)).filter(Boolean)
    : [])];
  if (!selections.length) throw Object.assign(new Error("selection-empty"), { statusCode: 400 });
  if (selections.some((questionId) => !byId.has(questionId))) {
    throw Object.assign(new Error("selection-unavailable"), { statusCode: 409 });
  }
  const targetCount = Number(body.targetCount);
  if (!Number.isInteger(targetCount) || targetCount < 1) throw Object.assign(new Error("target-count-invalid"), { statusCode: 400 });
  if (targetCount > selections.length) throw Object.assign(new Error("target-count-exceeds-selection"), { statusCode: 409 });

  const chosenProblems = shuffled(selections).slice(0, targetCount)
    .map((questionId) => byId.get(questionId))
    .filter(Boolean)
    .sort(compareCurriculumProblems);
  const questions = chosenProblems.map((problem, index) => ({
    ...problemBankProblemToLocalQuestion(problem, index + 1),
    emphasisRanges: emphasisRangesFrom(problem),
    sequence: index + 1,
  }));

  res.status(200).json({
    questions,
    selectedCount: selections.length,
    outputCount: questions.length,
    excludedCount: selections.length - questions.length,
  });
}

function errorCode(error) {
  const raw = error instanceof Error ? error.message : "request-failed";
  if (raw.includes("PERMISSION_DENIED") || raw.includes("permission-denied")) return "problem-bank-permission-denied";
  return clean(raw, 300) || "request-failed";
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === "POST" && String(req.query?.mode || "") === "curriculum-variant") {
      await handleCurriculumVariant(req, res);
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const authUser = await requireAuthenticatedUser(req);
    await requireActiveSuperAdmin(authUser);
    res.status(200).json({ items: await listInternalLibrary() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "비공개 자료를 불러오지 못했습니다.";
    console.error("[internal-library]", message);
    if (message === "authentication-required" || message.includes("auth/id-token")) {
      res.status(401).json({ error: "로그인 정보가 만료되었습니다. 다시 로그인해주세요." });
      return;
    }
    if (message === "admin-access-required") {
      res.status(403).json({ error: "지정된 관리자 계정만 비공개 자료를 볼 수 있습니다." });
      return;
    }
    if (message === "server-auth-not-configured") {
      res.status(503).json({ error: "서버 로그인 검증 설정이 필요합니다." });
      return;
    }
    res.status(Number(error?.statusCode) || 500).json({ error: errorCode(error) });
  }
}
