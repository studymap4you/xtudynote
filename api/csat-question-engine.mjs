import { randomUUID } from "node:crypto";
import admin from "firebase-admin";
import { buildNextBatchTypes, buildQuestionTypePlan } from "./_lib/csat-question-engine/build-batch-plan.mjs";
import { buildQuestionPrompt } from "./_lib/csat-question-engine/build-question-prompt.mjs";
import { loadQuestionRules, CSAT_RULES_DB_VERSION } from "./_lib/csat-question-engine/load-question-rules.mjs";
import { parseUserRequest } from "./_lib/csat-question-engine/parse-user-request.mjs";
import { searchQuestionBank } from "./_lib/csat-question-engine/question-bank-repository.mjs";
import { generateNextValidatedBatch } from "./_lib/csat-question-engine/run-question-generation-pipeline.mjs";
import { searchSourceDocuments } from "./_lib/csat-question-engine/source-repository.mjs";
import {
  requestTextbookJson,
  resolveTextbookAiProvider,
  textbookAiResponseMeta,
} from "./_lib/textbook-ai-provider.mjs";

const GENERATION_VERSION = "csat-question-engine-v1";
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "xtudynote.firebasestorage.app";
const MAX_SOURCE_TEXT_LENGTH = 120_000;

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

function sanitizeText(value, maxLength = 8_000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .map(([key, nested]) => [key, stripUndefined(nested)]),
  );
}

function toIso(value) {
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function jobTitle(request) {
  const level = request.targetLevel === "high" ? "상위권" : request.targetLevel === "low" ? "기초" : "중위권";
  const types = request.requestedTypes.length
    ? request.requestedTypes.slice(0, 3).join(" · ")
    : "수능 영어 혼합 유형";
  return `${level} ${types} ${request.targetQuestionCount}문항`;
}

function normalizeJobSummary(snapshot) {
  const data = snapshot.data() || {};
  const request = data.request || {};
  return {
    id: snapshot.id,
    title: sanitizeText(data.title, 180) || "수능 영어 문제 세트",
    status: ["planned", "generating", "completed", "failed", "paused"].includes(data.status)
      ? data.status
      : "planned",
    userRequest: sanitizeText(request.userRequest, 8_000),
    targetQuestionCount: Number(request.targetQuestionCount) || 40,
    acceptedCount: Number(data.acceptedCount) || 0,
    rejectedCount: Number(data.rejectedCount) || 0,
    modelCallCount: Number(data.modelCallCount) || 0,
    retryCount: Number(data.retryCount) || 0,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

async function getOwnedJob(uid, id) {
  const cleanId = sanitizeText(id, 120);
  if (!cleanId || cleanId.includes("/")) return null;
  const ref = admin.firestore().doc(`csat_question_jobs/${cleanId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.ownerUid !== uid) return null;
  return { ref, snapshot };
}

async function loadJobQuestions(jobRef) {
  const snapshot = await jobRef.collection("questions").limit(60).get();
  return snapshot.docs
    .map((doc) => doc.data())
    .filter((question) => question?.id)
    .sort((left, right) => Number(left.sequence) - Number(right.sequence));
}

async function listJobs(uid) {
  const snapshot = await admin.firestore().collection("csat_question_jobs").where("ownerUid", "==", uid).limit(100).get();
  return snapshot.docs
    .filter((doc) => doc.data()?.generationVersion === GENERATION_VERSION)
    .map(normalizeJobSummary)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 60);
}

async function loadJob(uid, id) {
  const owned = await getOwnedJob(uid, id);
  if (!owned) return null;
  const data = owned.snapshot.data() || {};
  const questions = await loadJobQuestions(owned.ref);
  return {
    ...normalizeJobSummary(owned.snapshot),
    request: data.request,
    questionTypePlan: Array.isArray(data.questionTypePlan) ? data.questionTypePlan : [],
    questions,
    model: sanitizeText(data.model, 160) || undefined,
    provider: sanitizeText(data.provider, 40) || undefined,
    rulesVersion: sanitizeText(data.rulesVersion, 40) || CSAT_RULES_DB_VERSION,
    consecutiveFailedBatches: Number(data.consecutiveFailedBatches) || 0,
    warning: sanitizeText(data.warning, 1_000) || undefined,
  };
}

async function deleteJob(uid, id) {
  const owned = await getOwnedJob(uid, id);
  if (!owned) return false;
  const [questions, batches] = await Promise.all([
    owned.ref.collection("questions").get(),
    owned.ref.collection("batches").get(),
  ]);
  const batch = admin.firestore().batch();
  questions.docs.forEach((doc) => batch.delete(doc.ref));
  batches.docs.forEach((doc) => batch.delete(doc.ref));
  batch.delete(owned.ref);
  await batch.commit();
  return true;
}

async function createJob(authUser, body) {
  const request = parseUserRequest(body.userRequest);
  const sourceText = sanitizeText(body.sourceText, MAX_SOURCE_TEXT_LENGTH);
  const uploadedFiles = Array.isArray(body.uploadedFiles)
    ? body.uploadedFiles.map((file) => ({
        name: sanitizeText(file?.name, 500),
        size: Math.max(0, Number(file?.size) || 0),
        type: sanitizeText(file?.type, 200),
      })).filter((file) => file.name).slice(0, 30)
    : [];
  const sourceSnapshot = await admin.firestore()
    .collection("contents")
    .where("libraryCategory", "==", "source_material")
    .limit(250)
    .get();
  const questionBankSnapshot = await admin.firestore()
    .collection("csat_english_questions")
    .where("section", "==", "reading")
    .limit(250)
    .get();
  if (sourceSnapshot.empty && !sourceText) throw new Error("source-db-unavailable");
  if (questionBankSnapshot.size < 20) throw new Error("question-bank-unavailable");

  const ref = admin.firestore().collection("csat_question_jobs").doc();
  const questionTypePlan = buildQuestionTypePlan(request);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set({
    generationVersion: GENERATION_VERSION,
    ownerUid: authUser.uid,
    title: jobTitle(request),
    status: "planned",
    request,
    questionTypePlan,
    sourceText,
    uploadedFiles,
    sourceUsage: {},
    sourceCandidateCount: sourceSnapshot.size + Number(Boolean(sourceText)),
    questionBankRecordCount: questionBankSnapshot.size,
    rulesVersion: CSAT_RULES_DB_VERSION,
    acceptedCount: 0,
    rejectedCount: 0,
    modelCallCount: 0,
    retryCount: 0,
    batchCount: 0,
    consecutiveFailedBatches: 0,
    createdAt: now,
    updatedAt: now,
  });
  const snapshot = await ref.get();
  return {
    ...normalizeJobSummary(snapshot),
    request,
    questionTypePlan,
    questions: [],
    sourceCandidateCount: sourceSnapshot.size + Number(Boolean(sourceText)),
    questionBankRecordCount: questionBankSnapshot.size,
    rulesVersion: CSAT_RULES_DB_VERSION,
  };
}

async function generateJobBatch(authUser, body) {
  const owned = await getOwnedJob(authUser.uid, body.jobId);
  if (!owned) throw new Error("question-job-not-found");
  const data = owned.snapshot.data() || {};
  if (data.generationVersion !== GENERATION_VERSION) throw new Error("question-job-version-mismatch");
  const request = data.request;
  const existingQuestions = await loadJobQuestions(owned.ref);
  if (existingQuestions.length >= request.targetQuestionCount) {
    return { job: await loadJob(authUser.uid, owned.snapshot.id), batchQuestions: [] };
  }

  const targetTypes = buildNextBatchTypes(data.questionTypePlan || buildQuestionTypePlan(request), existingQuestions, 5);
  const sources = await searchSourceDocuments({
    firestore: admin.firestore(),
    bucket: admin.storage().bucket(STORAGE_BUCKET),
    request,
    userSourceText: sanitizeText(data.sourceText, MAX_SOURCE_TEXT_LENGTH),
    sourceUsage: data.sourceUsage || {},
    limit: Math.max(3, Math.ceil(targetTypes.length / 1.5)),
  });
  if (sources.length < 3) throw new Error("source-db-unavailable");
  const references = await searchQuestionBank({
    firestore: admin.firestore(),
    questionTypes: targetTypes,
    limit: 18,
    rotation: Number(data.batchCount) || 0,
  });
  if (references.length === 0) throw new Error("question-bank-unavailable");
  const rules = loadQuestionRules([...new Set(targetTypes)]);
  const provider = resolveTextbookAiProvider(process.env, "questions");
  if (provider.kind === "mock") throw new Error(`ai-provider-not-configured:${provider.reason || "unknown"}`);
  const batchNumber = (Number(data.batchCount) || 0) + 1;
  const batchId = `batch-${String(batchNumber).padStart(3, "0")}-${randomUUID().slice(0, 8)}`;
  const providerAttempts = [];
  const modelsUsed = [];

  let result;
  try {
    result = await generateNextValidatedBatch({
      request,
      targetTypes,
      sources,
      references,
      rules,
      existingQuestions,
      batchId,
      generateBatch: async (promptContext) => {
        const prompt = buildQuestionPrompt(promptContext);
        const response = await requestTextbookJson({
          provider: { ...provider, enableThinking: false },
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          maxTokens: 16_000,
          temperature: 0.32,
          timeoutMs: 55_000,
          maxElapsedMs: 250_000,
          retryDelaysMs: [0, 2_500],
          retryStrategy: "round-robin",
        });
        const meta = textbookAiResponseMeta(response);
        if (meta?.model) modelsUsed.push(meta.model);
        if (Array.isArray(meta?.attempts)) providerAttempts.push(...meta.attempts);
        return response;
      },
    });
  } catch (error) {
    const failedAttempts = Array.isArray(error?.providerAttempts) ? error.providerAttempts : [];
    providerAttempts.push(...failedAttempts);
    const lastAttempt = providerAttempts.at(-1);
    await owned.ref.update({
      ...stripUndefined({
        model: lastAttempt?.model || provider.model,
        provider: provider.kind,
        lastProviderAttempts: providerAttempts.slice(-24),
        warning: "AI 모델 연결이 일시적으로 중단되었습니다. 세 모델을 순차 확인한 뒤 이어서 시도할 수 있습니다.",
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw error;
  }

  const remaining = request.targetQuestionCount - existingQuestions.length;
  const accepted = result.accepted.slice(0, remaining);
  const sourceUsage = { ...(data.sourceUsage || {}) };
  accepted.forEach((question) => {
    sourceUsage[question.sourceId] = Number(sourceUsage[question.sourceId] || 0) + 1;
  });
  const acceptedCount = existingQuestions.length + accepted.length;
  const consecutiveFailedBatches = accepted.length ? 0 : (Number(data.consecutiveFailedBatches) || 0) + 1;
  const completed = acceptedCount >= request.targetQuestionCount;
  const failed = !completed && consecutiveFailedBatches >= 3;
  const writeBatch = admin.firestore().batch();
  accepted.forEach((question, index) => {
    const questionRef = owned.ref.collection("questions").doc(question.id);
    writeBatch.set(questionRef, {
      ...stripUndefined(question),
      sequence: existingQuestions.length + index + 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  writeBatch.set(owned.ref.collection("batches").doc(batchId), {
    ...stripUndefined({
      batchId,
      batchNumber,
      assignments: result.assignments,
      acceptedQuestionIds: accepted.map((question) => question.id),
      rejected: result.rejected.slice(0, 30),
      missingAssignments: result.missingAssignments,
      modelCallCount: result.modelCallCount,
      retryCount: result.retryCount,
      model: modelsUsed.at(-1) || provider.model,
      modelsUsed: [...new Set(modelsUsed)],
      providerAttempts: providerAttempts.slice(-30),
      sourceIds: sources.map((source) => source.id),
      referenceQuestionIds: references.map((reference) => reference.id),
    }),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  writeBatch.update(owned.ref, {
    ...stripUndefined({
      status: completed ? "completed" : failed ? "failed" : "generating",
      acceptedCount,
      rejectedCount: (Number(data.rejectedCount) || 0) + result.rejected.length,
      modelCallCount: (Number(data.modelCallCount) || 0) + result.modelCallCount,
      retryCount: (Number(data.retryCount) || 0) + result.retryCount,
      batchCount: batchNumber,
      consecutiveFailedBatches,
      sourceUsage,
      model: modelsUsed.at(-1) || provider.model,
      provider: provider.kind,
      warning: failed
        ? "일부 문제 생성 과정에서 오류가 발생했습니다. 현재까지 생성된 문제를 확인하거나 다시 시도할 수 있습니다."
        : null,
    }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await writeBatch.commit();
  return {
    job: await loadJob(authUser.uid, owned.snapshot.id),
    batchQuestions: accepted,
    batch: {
      id: batchId,
      requested: targetTypes.length,
      accepted: accepted.length,
      rejected: result.rejected.length,
      modelCallCount: result.modelCallCount,
      retryCount: result.retryCount,
      exhausted: result.exhausted,
      model: modelsUsed.at(-1) || provider.model,
      modelsUsed: [...new Set(modelsUsed)],
      providerAttempts: providerAttempts.slice(-30),
    },
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const authUser = await requireAuthenticatedUser(req);
    const id = sanitizeText(req.query?.id, 120);
    if (req.method === "GET" && !id) {
      res.status(200).json({ items: await listJobs(authUser.uid) });
      return;
    }
    if (req.method === "GET") {
      const job = await loadJob(authUser.uid, id);
      if (!job) {
        res.status(404).json({ error: "저장된 문제 세트를 찾을 수 없습니다." });
        return;
      }
      res.status(200).json({ job });
      return;
    }
    if (req.method === "DELETE") {
      const deleted = await deleteJob(authUser.uid, id);
      if (!deleted) {
        res.status(404).json({ error: "삭제할 문제 세트를 찾을 수 없습니다." });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const action = sanitizeText(body.action, 40);
    if (action === "start") {
      res.status(200).json({ job: await createJob(authUser, body) });
      return;
    }
    if (action === "next-batch") {
      res.status(200).json(await generateJobBatch(authUser, body));
      return;
    }
    res.status(400).json({ error: "지원하지 않는 문제 생성 작업입니다." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "수능 영어 문제 생성 중 문제가 발생했습니다.";
    console.error("[csat-question-engine]", message);
    if (message === "authentication-required" || message.includes("auth/id-token")) {
      res.status(401).json({ error: "로그인 정보가 만료되었습니다. 다시 로그인해주세요." });
      return;
    }
    if (message === "server-auth-not-configured") {
      res.status(503).json({ error: "서버 로그인 검증 설정이 필요합니다." });
      return;
    }
    if (message === "question-request-required") {
      res.status(400).json({ error: "만들고 싶은 수능 영어 문제를 자연어로 입력해주세요." });
      return;
    }
    if (message === "question-job-not-found") {
      res.status(404).json({ error: "문제 생성 작업을 찾을 수 없습니다." });
      return;
    }
    if (["source-db-unavailable", "question-bank-unavailable"].includes(message)) {
      res.status(503).json({ error: "원문소스 또는 수능 문제은행 DB를 불러오지 못했습니다. 라이브러리 연결을 확인해주세요." });
      return;
    }
    if (message.startsWith("ai-provider-not-configured")) {
      res.status(503).json({ error: "비용 없는 NVIDIA 생성 모델이 연결되지 않았습니다. 서버 API 설정을 확인해주세요." });
      return;
    }
    const userMessage = message.startsWith("ai-provider-")
      ? "세 개의 AI 생성 모델을 순차 확인했지만 응답을 완료하지 못했습니다. 저장된 문제 다음 배치부터 다시 시도해주세요."
      : "문제 생성 배치를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
    res.status(message.startsWith("ai-provider-") ? 503 : 500).json({ error: userMessage });
  }
}
