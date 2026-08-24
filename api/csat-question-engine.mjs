import { randomUUID } from "node:crypto";
import admin from "firebase-admin";
import {
  buildNextBatchTypes,
  buildQuestionTypePlan,
  QUESTION_BATCH_MAX,
} from "./_lib/csat-question-engine/build-batch-plan.mjs";
import { buildQuestionPrompt } from "./_lib/csat-question-engine/build-question-prompt.mjs";
import { loadQuestionRules, CSAT_RULES_DB_VERSION } from "./_lib/csat-question-engine/load-question-rules.mjs";
import { parseUserRequest } from "./_lib/csat-question-engine/parse-user-request.mjs";
import { searchQuestionBank } from "./_lib/csat-question-engine/question-bank-repository.mjs";
import { generateNextValidatedBatch } from "./_lib/csat-question-engine/run-question-generation-pipeline.mjs";
import { searchSourceDocuments } from "./_lib/csat-question-engine/source-repository.mjs";
import {
  isProblemBankConfigured,
  problemBankProblemToLocalQuestion,
  reportProblemBankGenerationRun,
  reportProblemBankUsage,
  saveGeneratedQuestionToProblemBank,
  searchReusableProblemBankQuestions,
} from "./_lib/problem-bank/client.mjs";
import {
  requestTextbookJson,
  resolveTextbookAiProvider,
  textbookAiResponseMeta,
} from "./_lib/textbook-ai-provider.mjs";

const GENERATION_VERSION = "csat-question-engine-v1";
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "xtudynote.firebasestorage.app";
const MAX_SOURCE_TEXT_LENGTH = 120_000;
const MAX_PROGRESS_EVENTS = 900;

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

function redactProgressText(value, maxLength = 1_000) {
  return sanitizeText(value, maxLength)
    .replace(/\b(?:sk-(?:proj-)?|nvapi-)[A-Za-z0-9_-]{8,}\b/giu, "[REDACTED]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/giu, "$1[REDACTED]")
    .replace(/((?:api[_ -]?key|client[_ -]?secret|authorization)\s*[:=]\s*)\S+/giu, "$1[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[REDACTED]");
}

function normalizeProgressEvent(id, data = {}) {
  const status = ["running", "completed", "info", "warning", "error"].includes(data.status)
    ? data.status
    : "info";
  return {
    id: sanitizeText(data.id, 120) || id,
    sequence: Math.max(0, Number(data.sequence) || 0),
    phase: sanitizeText(data.phase, 80) || "engine",
    status,
    title: redactProgressText(data.title, 220) || "진행 상태 업데이트",
    summary: redactProgressText(data.summary, 700) || undefined,
    details: Array.isArray(data.details)
      ? data.details.map((item) => redactProgressText(item, 1_000)).filter(Boolean).slice(0, 80)
      : [],
    batchNumber: Number(data.batchNumber) > 0 ? Number(data.batchNumber) : undefined,
    createdAt: typeof data.createdAt === "string" && !Number.isNaN(Date.parse(data.createdAt))
      ? new Date(data.createdAt).toISOString()
      : new Date(0).toISOString(),
  };
}

function createProgressRecorder(jobRef, initialSequence = 0, defaultBatchNumber) {
  let sequence = Math.max(0, Number(initialSequence) || 0);
  return async function recordProgress(event) {
    sequence += 1;
    const eventRef = jobRef.collection("progress_events").doc();
    const payload = normalizeProgressEvent(eventRef.id, {
      ...event,
      id: eventRef.id,
      sequence,
      batchNumber: event.batchNumber || defaultBatchNumber,
      createdAt: new Date().toISOString(),
    });
    try {
      const batch = admin.firestore().batch();
      batch.set(eventRef, stripUndefined(payload));
      batch.update(jobRef, {
        latestProgress: stripUndefined(payload),
        progressSequence: sequence,
        progressEventCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      console.warn("[csat-question-engine] progress event skipped", payload.phase, error instanceof Error ? error.message : error);
    }
    return payload;
  };
}

async function loadProgressEvents(jobRef, afterSequence = 0, limit = MAX_PROGRESS_EVENTS) {
  const collection = jobRef.collection("progress_events");
  const query = Number(afterSequence) > 0
    ? collection.where("sequence", ">", Number(afterSequence)).orderBy("sequence", "asc")
    : collection.orderBy("sequence", "asc");
  const snapshot = await query.limit(Math.min(MAX_PROGRESS_EVENTS, Math.max(1, Number(limit) || MAX_PROGRESS_EVENTS))).get();
  return snapshot.docs.map((doc) => normalizeProgressEvent(doc.id, doc.data()));
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
    reusedQuestionCount: Number(data.reusedQuestionCount) || 0,
    generatedQuestionCount: Number(data.generatedQuestionCount) || 0,
    problemBankSavedCount: Number(data.problemBankSavedCount) || 0,
    problemBankEnabled: Boolean(data.problemBankEnabled),
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
  const [questions, progressEvents] = await Promise.all([
    loadJobQuestions(owned.ref),
    loadProgressEvents(owned.ref),
  ]);
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
    progressSequence: Number(data.progressSequence) || progressEvents.at(-1)?.sequence || 0,
    progressEvents,
    latestProgress: data.latestProgress
      ? normalizeProgressEvent(data.latestProgress.id || "latest", data.latestProgress)
      : progressEvents.at(-1),
  };
}

async function loadProgressSnapshot(uid, id, afterSequence) {
  const owned = await getOwnedJob(uid, id);
  if (!owned) return null;
  const data = owned.snapshot.data() || {};
  const progressEvents = await loadProgressEvents(owned.ref, afterSequence, 200);
  return {
    jobId: owned.snapshot.id,
    status: ["planned", "generating", "completed", "failed", "paused"].includes(data.status) ? data.status : "planned",
    acceptedCount: Number(data.acceptedCount) || 0,
    rejectedCount: Number(data.rejectedCount) || 0,
    modelCallCount: Number(data.modelCallCount) || 0,
    retryCount: Number(data.retryCount) || 0,
    reusedQuestionCount: Number(data.reusedQuestionCount) || 0,
    generatedQuestionCount: Number(data.generatedQuestionCount) || 0,
    problemBankSavedCount: Number(data.problemBankSavedCount) || 0,
    problemBankEnabled: Boolean(data.problemBankEnabled),
    model: sanitizeText(data.model, 160) || undefined,
    warning: sanitizeText(data.warning, 1_000) || undefined,
    progressSequence: Number(data.progressSequence) || progressEvents.at(-1)?.sequence || 0,
    progressEvents,
    latestProgress: data.latestProgress
      ? normalizeProgressEvent(data.latestProgress.id || "latest", data.latestProgress)
      : progressEvents.at(-1),
  };
}

async function deleteJob(uid, id) {
  const owned = await getOwnedJob(uid, id);
  if (!owned) return false;
  const [questions, batches, progressEvents] = await Promise.all([
    owned.ref.collection("questions").get(),
    owned.ref.collection("batches").get(),
    owned.ref.collection("progress_events").get(),
  ]);
  const childRefs = [...questions.docs, ...batches.docs, ...progressEvents.docs].map((doc) => doc.ref);
  for (let index = 0; index < childRefs.length; index += 400) {
    const childBatch = admin.firestore().batch();
    childRefs.slice(index, index + 400).forEach((ref) => childBatch.delete(ref));
    await childBatch.commit();
  }
  await owned.ref.delete();
  return true;
}

async function createJob(authUser, body) {
  const jobStartedAt = Date.now();
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
    .limit(500)
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
  const problemBankEnabled = isProblemBankConfigured();
  const generationRunId = `XUG_${ref.id}`;
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
    generationRunId,
    problemBankEnabled,
    reusedQuestionCount: 0,
    generatedQuestionCount: 0,
    problemBankSavedCount: 0,
    batchCount: 0,
    consecutiveFailedBatches: 0,
    progressSequence: 0,
    progressEventCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const recordProgress = createProgressRecorder(ref);
  await recordProgress({
    phase: "request",
    status: "completed",
    title: "사용자 요청을 구조화했습니다",
    summary: `${request.targetQuestionCount}문항 생성 계획을 확정했습니다.`,
    details: [
      `대상 학년: ${request.targetGrade}`,
      `난이도: ${request.targetLevel}`,
      `요청 유형: ${request.requestedTypes.length ? request.requestedTypes.join(", ") : "수능 영어 혼합 유형"}`,
      `첨부 파일: ${uploadedFiles.length}개`,
      `첨부 원문 분량: ${sourceText.length.toLocaleString("ko-KR")}자`,
    ],
  });
  await recordProgress({
    phase: "database",
    status: "completed",
    title: "라이브러리 데이터 연결을 확인했습니다",
    summary: "원문소스와 수능 문제은행을 생성 작업에 연결했습니다.",
    details: [
      `검색 가능한 원문소스: ${sourceSnapshot.size + Number(Boolean(sourceText))}건`,
      `수능 문제은행 레코드: ${questionBankSnapshot.size}건`,
      `규칙 DB 버전: ${CSAT_RULES_DB_VERSION}`,
    ],
  });
  await recordProgress({
    phase: "plan",
    status: "completed",
    title: "전체 문제 유형 순서를 설계했습니다",
    summary: `최대 2문항씩 ${Math.ceil(request.targetQuestionCount / QUESTION_BATCH_MAX)}개 배치로 생성합니다.`,
    details: questionTypePlan.map((type, index) => `${index + 1}번: ${type}`),
  });

  if (!problemBankEnabled) {
    await recordProgress({
      phase: "global-problem-bank",
      status: "info",
      title: "전역 문제은행 연결 설정을 기다리고 있습니다",
      summary: "기존 문제 생성 로직으로 계속 진행합니다.",
      details: [
        "PROBLEM_BANK_API_URL: 미설정",
        "PROBLEM_BANK_SERVICE_TOKEN: 미설정 또는 비활성",
        "문제은행 연결 실패가 기존 생성 기능을 중단시키지 않습니다.",
      ],
    });
    return loadJob(authUser.uid, ref.id);
  }

  await recordProgress({
    phase: "global-problem-bank",
    status: "running",
    title: "전역 문제은행에서 재사용 가능한 문항을 검색하고 있습니다",
    summary: `${request.targetQuestionCount}문항을 유형별로 먼저 조회합니다.`,
    details: [
      "검색 상태: approved, gold",
      "중복 방지: questionId 및 duplicate cluster",
      "선택 기준: 유형, 난이도, 의미 유사도, 품질, 사용 다양성",
    ],
  });

  try {
    const reusable = await searchReusableProblemBankQuestions({
      request,
      questionTypePlan,
      workbookId: ref.id,
    });
    const reusedQuestions = reusable.questions
      .map((problem, index) => problemBankProblemToLocalQuestion(problem, index + 1))
      .filter((question) => (
        question.id
        && question.stem
        && question.passage
        && question.choices.length === 5
        && question.answer >= 1
        && question.answer <= 5
      ))
      .slice(0, request.targetQuestionCount);
    const completedByReuse = reusedQuestions.length >= request.targetQuestionCount;
    if (reusedQuestions.length) {
      const reuseBatch = admin.firestore().batch();
      reusedQuestions.forEach((question, index) => {
        reuseBatch.set(ref.collection("questions").doc(question.id), {
          ...stripUndefined(question),
          sequence: index + 1,
          origin: "global-problem-bank",
          reusedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      reuseBatch.update(ref, {
        status: completedByReuse ? "completed" : "planned",
        acceptedCount: reusedQuestions.length,
        reusedQuestionCount: reusedQuestions.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await reuseBatch.commit();

      await Promise.allSettled(reusedQuestions.map((question) => reportProblemBankUsage({
        questionId: question.id,
        workbookId: ref.id,
      })));
    }

    await recordProgress({
      phase: "global-problem-bank",
      status: "completed",
      title: `${reusedQuestions.length}개 문항을 전역 문제은행에서 확보했습니다`,
      summary: reusedQuestions.length >= request.targetQuestionCount
        ? "요청 문항을 모두 재사용하여 AI 신규 생성을 생략합니다."
        : `부족한 ${request.targetQuestionCount - reusedQuestions.length}문항만 AI로 생성합니다.`,
      details: [
        ...reusable.searches.map((search) => (
          `${search.questionType} · 요청 ${search.requestedCount} · 확보 ${search.foundCount} · 부족 ${search.missingCount} · ${search.searchMode || "검색 완료"}`
        )),
        `최종 재사용률: ${Math.round((reusedQuestions.length / request.targetQuestionCount) * 100)}%`,
      ],
    });

    if (completedByReuse) {
      await Promise.allSettled([
        reportProblemBankGenerationRun({
          generationRunId,
          request,
          reusedQuestionCount: reusedQuestions.length,
          generatedQuestionCount: 0,
          rejectedQuestionCount: 0,
          savedQuestionCount: 0,
          modelsUsed: [],
          durationMs: Date.now() - jobStartedAt,
        }),
      ]);
    }
  } catch (error) {
    await recordProgress({
      phase: "global-problem-bank",
      status: "warning",
      title: "전역 문제은행 조회를 건너뛰고 기존 생성 방식으로 계속합니다",
      summary: error instanceof Error ? error.message : "문제은행 API가 응답하지 않았습니다.",
      details: [
        "기존 원문 검색, 수능 유형 분석, 2문항 단위 생성은 그대로 유지됩니다.",
        "문제은행 서비스 복구 후 다음 작업부터 자동 재사용됩니다.",
      ],
    });
  }
  return loadJob(authUser.uid, ref.id);
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

  const batchNumber = (Number(data.batchCount) || 0) + 1;
  const batchId = `batch-${String(batchNumber).padStart(3, "0")}-${randomUUID().slice(0, 8)}`;
  const recordProgress = createProgressRecorder(owned.ref, data.progressSequence, batchNumber);
  await owned.ref.update({
    status: "generating",
    warning: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const targetTypes = buildNextBatchTypes(
    data.questionTypePlan || buildQuestionTypePlan(request),
    existingQuestions,
    QUESTION_BATCH_MAX,
  );
  await recordProgress({
    phase: "batch",
    status: "running",
    title: `${batchNumber}번째 2문항 배치를 시작했습니다`,
    summary: `현재 ${existingQuestions.length}/${request.targetQuestionCount}문항이 저장되어 있습니다.`,
    details: [
      `배치 ID: ${batchId}`,
      `이번 목표 유형: ${targetTypes.join(", ")}`,
      `남은 문항: ${request.targetQuestionCount - existingQuestions.length}개`,
    ],
  });
  await recordProgress({
    phase: "source",
    status: "running",
    title: "원문소스 후보를 검색하고 있습니다",
    summary: "사용자 요청의 주제와 이전 사용 이력을 기준으로 원문 청크를 검색합니다.",
    details: [
      `라이브러리 범주: source_material`,
      `요청 텍스트 길이: ${sanitizeText(request.userRequest, 8_000).length}자`,
      `사용자 첨부 원문: ${sanitizeText(data.sourceText, MAX_SOURCE_TEXT_LENGTH).length}자`,
    ],
  });
  let sources;
  try {
    sources = await searchSourceDocuments({
      firestore: admin.firestore(),
      bucket: admin.storage().bucket(STORAGE_BUCKET),
      request,
      userSourceText: sanitizeText(data.sourceText, MAX_SOURCE_TEXT_LENGTH),
      sourceUsage: data.sourceUsage || {},
      limit: Math.max(3, Math.ceil(targetTypes.length / 1.5)),
    });
  } catch (error) {
    await recordProgress({
      phase: "source",
      status: "error",
      title: "원문소스 검색 중 오류가 발생했습니다",
      summary: error instanceof Error ? error.message : "원문소스를 불러오지 못했습니다.",
      details: [],
    });
    throw error;
  }
  if (sources.length < 3) {
    await recordProgress({
      phase: "source",
      status: "error",
      title: "사용 가능한 원문소스가 부족합니다",
      summary: `${sources.length}건을 찾았으며 최소 3건이 필요합니다.`,
      details: sources.map((source) => `${source.title} · ${source.id}`),
    });
    throw new Error("source-db-unavailable");
  }
  await recordProgress({
    phase: "source",
    status: "completed",
    title: `${sources.length}개의 원문소스를 선택했습니다`,
    summary: "본문 전체를 저장하지 않고 선택 근거와 사용 메타데이터만 표시합니다.",
    details: sources.map((source, index) => {
      const words = (String(source.text || "").match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || []).length;
      return `${index + 1}. ${source.title} · ID ${source.id} · ${words}단어 · ${source.sourceType} · ${source.copyrightStatus}`;
    }),
  });

  await recordProgress({
    phase: "question-bank",
    status: "running",
    title: "수능 문제은행에서 유형별 기준 문항을 찾고 있습니다",
    summary: "생성 대상 유형과 일치하는 실제 수능 구조 레코드를 검색합니다.",
    details: targetTypes.map((type) => `검색 유형: ${type}`),
  });
  let references;
  try {
    references = await searchQuestionBank({
      firestore: admin.firestore(),
      questionTypes: targetTypes,
      limit: 18,
      rotation: Number(data.batchCount) || 0,
    });
  } catch (error) {
    await recordProgress({
      phase: "question-bank",
      status: "error",
      title: "수능 문제은행 조회 중 오류가 발생했습니다",
      summary: error instanceof Error ? error.message : "문제은행을 불러오지 못했습니다.",
      details: targetTypes.map((type) => `조회 유형: ${type}`),
    });
    throw error;
  }
  if (references.length === 0) {
    await recordProgress({
      phase: "question-bank",
      status: "error",
      title: "일치하는 수능 문제은행 레코드를 찾지 못했습니다",
      summary: "문제은행 연결과 유형 매핑을 확인해야 합니다.",
      details: targetTypes.map((type) => `미확보 유형: ${type}`),
    });
    throw new Error("question-bank-unavailable");
  }
  await recordProgress({
    phase: "question-bank",
    status: "completed",
    title: `${references.length}개의 수능 기준 문항을 연결했습니다`,
    summary: "문항 내용은 복사하지 않고 출제 구조와 오답 설계 기준만 참조합니다.",
    details: references.map((reference) => (
      `${reference.year || "연도 미상"} CSAT ${reference.questionNumber || "번호 미상"}번 · ${reference.questionType} · ${reference.id}`
    )),
  });

  let rules;
  try {
    rules = loadQuestionRules([...new Set(targetTypes)]);
  } catch (error) {
    await recordProgress({
      phase: "rules",
      status: "error",
      title: "유형별 규칙을 불러오지 못했습니다",
      summary: error instanceof Error ? error.message : "규칙 DB 오류가 발생했습니다.",
      details: targetTypes.map((type) => `필요 규칙: ${type}`),
    });
    throw error;
  }
  await recordProgress({
    phase: "rules",
    status: "completed",
    title: `규칙 DB ${rules.version}의 유형별 규칙을 적용했습니다`,
    summary: `${rules.questionTypes.length}개 유형의 정답·오답·지문·검증 규칙을 모델 요청에 포함합니다.`,
    details: rules.questionTypes.map((rule) => (
      `${rule.id} · ${rule.ko_name} · 정답 규칙: ${rule.correct_option_rule} · 검증: ${(rule.validation_rules || []).join(" / ")}`
    )),
  });

  const provider = resolveTextbookAiProvider(process.env, "questions");
  if (provider.kind === "mock") {
    await recordProgress({
      phase: "model",
      status: "error",
      title: "AI 생성 모델 설정을 찾지 못했습니다",
      summary: provider.reason || "provider-not-configured",
      details: [],
    });
    throw new Error(`ai-provider-not-configured:${provider.reason || "unknown"}`);
  }
  await recordProgress({
    phase: "model",
    status: "completed",
    title: "AI 모델 폴백 구성을 확인했습니다",
    summary: `${provider.models?.length || 1}개 모델을 순차적으로 사용할 준비가 됐습니다.`,
    details: [
      `공급자: ${provider.kind}`,
      `API 주소: ${provider.baseUrl}`,
      `모델 순서: ${(provider.models || [provider.model]).join(" → ")}`,
      `숨겨진 추론 출력: 사용하지 않음`,
      `최대 출력 토큰: 16000`,
      `모델별 제한시간: 55000ms`,
      `전체 폴백 시간 예산: 250000ms`,
      `재시도 간격: 0ms, 2500ms`,
    ],
  });
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
      onProgress: async (event) => {
        if (event.stage === "assignments-prepared") {
          await recordProgress({
            phase: "plan",
            status: "completed",
            title: "이번 배치의 문제·원문 배정을 확정했습니다",
            summary: `${event.assignments.length}개 문항을 서로 다른 원문 근거에 배정했습니다.`,
            details: event.assignments.map((assignment, index) => {
              const source = sources.find((item) => item.id === assignment.sourceId);
              return `${index + 1}. ${assignment.questionType} ← ${source?.title || assignment.sourceId} (${assignment.sourceId})`;
            }),
          });
          return;
        }
        if (event.stage === "generation-attempt-started") {
          await recordProgress({
            phase: "generation",
            status: "running",
            title: `${event.generationAttempt}차 문제 생성 시도를 시작했습니다`,
            summary: `${event.assignments.length}개 미완성 문항을 모델에 요청합니다.`,
            details: [
              ...event.assignments.map((assignment) => `${assignment.questionType} · Source ${assignment.sourceId}`),
              ...(event.previousRejectionIssues || []).map((issue) => `이전 탈락 피드백: ${issue}`),
            ],
          });
          return;
        }
        if (event.stage === "model-response-parsed") {
          await recordProgress({
            phase: "generation",
            status: event.candidateCount > 0 ? "completed" : "warning",
            title: `모델 응답에서 ${event.candidateCount}개 후보를 읽었습니다`,
            summary: `JSON 파싱 완료 · 생성 시도 ${event.generationAttempt}차`,
            details: [],
          });
          return;
        }
        if (event.stage === "candidate-rejected") {
          const candidateLabel = Number(event.candidateIndex) >= 0
            ? `후보 ${Number(event.candidateIndex) + 1}번`
            : "모델 응답";
          await recordProgress({
            phase: "validation",
            status: "warning",
            title: `${candidateLabel}이 품질 검증에서 탈락했습니다`,
            summary: `${event.questionType || "유형 미확인"} · Source ${event.sourceId || "미확인"}`,
            details: (event.issues || []).map((issue) => `탈락 사유: ${issue}`),
          });
          return;
        }
        if (event.stage === "candidate-accepted") {
          await recordProgress({
            phase: "validation",
            status: "completed",
            title: `${event.questionType} 후보가 모든 품질 규칙을 통과했습니다`,
            summary: `문항 ${event.questionId}을 저장 대기열에 추가했습니다.`,
            details: [
              `Source ID: ${event.sourceId}`,
              `수능 reference: ${(event.referenceQuestionIds || []).join(", ")}`,
              `생성 시도: ${event.generationAttempt}차`,
            ],
          });
          return;
        }
        if (event.stage === "generation-attempt-completed") {
          await recordProgress({
            phase: "validation",
            status: event.remainingAssignments.length ? "warning" : "completed",
            title: `${event.generationAttempt}차 생성 검수를 마쳤습니다`,
            summary: `통과 ${event.acceptedCount}개 · 탈락 ${event.rejectedCount}개`,
            details: event.remainingAssignments.map((assignment) => `재시도 대상: ${assignment.questionType} · Source ${assignment.sourceId}`),
          });
          return;
        }
        if (event.stage === "validated-batch-completed") {
          await recordProgress({
            phase: "validation",
            status: event.missingAssignments.length ? "warning" : "completed",
            title: "이번 배치의 품질 검증을 완료했습니다",
            summary: `최종 통과 ${event.acceptedCount}개 · 누적 거부 기록 ${event.rejectedCount}개 · 모델 생성 호출 ${event.modelCallCount}회`,
            details: event.missingAssignments.map((assignment) => `미완성: ${assignment.questionType} · Source ${assignment.sourceId}`),
          });
        }
      },
      generateBatch: async (promptContext) => {
        const prompt = buildQuestionPrompt(promptContext);
        await recordProgress({
          phase: "prompt",
          status: "completed",
          title: "모델 입력 프롬프트를 조립했습니다",
          summary: `생성 시도 ${promptContext.generationAttempt}차의 구조화된 요청을 준비했습니다.`,
          details: [
            `시스템 지시문: ${prompt.system.length.toLocaleString("ko-KR")}자`,
            `사용자 입력 payload: ${prompt.user.length.toLocaleString("ko-KR")}자`,
            `배정 문항: ${promptContext.assignments.length}개`,
            `원문소스: ${promptContext.sources.length}개`,
            `수능 reference: ${promptContext.references.length}개`,
            `적용 규칙: ${promptContext.rules.questionTypes.length}개`,
            `기존 통과 문항 중복검사 대상: ${promptContext.existingQuestions.length}개`,
          ],
        });
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
          onProgress: async (event) => {
            if (event.stage === "retry-wait") {
              await recordProgress({
                phase: "model",
                status: "info",
                title: `${event.model} 재시도 전 대기 중입니다`,
                summary: `${event.delayMs}ms 후 ${event.attempt}차 연결을 시도합니다.`,
                details: [],
              });
              return;
            }
            if (event.stage === "attempt-started") {
              await recordProgress({
                phase: "model",
                status: "running",
                title: `${event.model}에 생성을 요청했습니다`,
                summary: `모델 연결 ${event.attempt}차 시도`,
                details: [`응답 제한시간: ${event.timeoutMs}ms`],
              });
              return;
            }
            if (event.stage === "attempt-succeeded") {
              await recordProgress({
                phase: "model",
                status: "completed",
                title: `${event.model} 응답을 정상 수신했습니다`,
                summary: `${event.durationMs}ms 소요 · HTTP ${event.status ?? "상태 미상"}`,
                details: [`모델 연결 ${event.attempt}차 시도에서 성공`],
              });
              return;
            }
            if (event.stage === "attempt-failed") {
              await recordProgress({
                phase: "model",
                status: event.retryable ? "warning" : "error",
                title: `${event.model} 응답 시도가 실패했습니다`,
                summary: `${event.durationMs}ms 소요 · ${event.error || "알 수 없는 오류"}`,
                details: [
                  `HTTP 상태: ${event.status ?? "없음"}`,
                  `재시도 가능: ${event.retryable ? "예" : "아니오"}`,
                  `서버 권장 대기: ${event.retryAfterMs || 0}ms`,
                ],
              });
              return;
            }
            if (event.stage === "time-budget-exhausted") {
              await recordProgress({
                phase: "model",
                status: "warning",
                title: "이번 모델 폴백의 시간 예산을 모두 사용했습니다",
                summary: `${event.elapsedMs}ms 경과 후 다음 배치 재시도를 위해 중단합니다.`,
                details: [`마지막 대상 모델: ${event.model}`, `시도 번호: ${event.attempt}`],
              });
            }
          },
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
    await recordProgress({
      phase: "model",
      status: "error",
      title: "이번 배치의 AI 모델 호출이 중단되었습니다",
      summary: error instanceof Error ? error.message : "모델 응답을 완료하지 못했습니다.",
      details: providerAttempts.slice(-12).map((attempt) => (
        `${attempt.model} · ${attempt.attempt}차 · ${attempt.durationMs}ms · HTTP ${attempt.status ?? "없음"} · ${attempt.error || "응답 수신"}`
      )),
    });
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
  const generatedQuestionCount = (Number(data.generatedQuestionCount) || 0) + accepted.length;
  const rejectedQuestionCount = (Number(data.rejectedCount) || 0) + result.rejected.length;
  const consecutiveFailedBatches = accepted.length ? 0 : (Number(data.consecutiveFailedBatches) || 0) + 1;
  const completed = acceptedCount >= request.targetQuestionCount;
  const failed = !completed && consecutiveFailedBatches >= 3;
  await recordProgress({
    phase: "storage",
    status: "running",
    title: "검증을 통과한 문항을 저장하고 있습니다",
    summary: `${accepted.length}개 문항과 배치 진단 정보를 Firestore에 기록합니다.`,
    details: [
      ...accepted.map((question, index) => `저장 예정 ${existingQuestions.length + index + 1}번 · ${question.questionType} · ${question.id}`),
      `거부 기록: ${result.rejected.length}건`,
      `모델 시도 기록: ${providerAttempts.length}건`,
      `사용 원문 ID: ${sources.map((source) => source.id).join(", ")}`,
      `수능 reference ID: ${references.map((reference) => reference.id).join(", ")}`,
    ],
  });
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
      rejectedCount: rejectedQuestionCount,
      generatedQuestionCount,
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

  let savedToProblemBank = 0;
  let problemBankSaveFailures = 0;
  if (data.problemBankEnabled && isProblemBankConfigured() && accepted.length) {
    await recordProgress({
      phase: "global-problem-bank",
      status: "running",
      title: "신규 생성 문항을 전역 문제은행에서 검수하고 있습니다",
      summary: `${accepted.length}개 문항을 raw 상태로 저장한 뒤 승인·중복 검사를 수행합니다.`,
      details: accepted.map((question) => `${question.questionType} · ${question.id}`),
    });
    const saveResults = await Promise.allSettled(accepted.map((question) => (
      saveGeneratedQuestionToProblemBank({
        question,
        request,
        provider: provider.kind,
        model: modelsUsed.at(-1) || provider.model,
        generationVersion: GENERATION_VERSION,
      })
    )));
    const approvedQuestionIds = [];
    saveResults.forEach((saveResult) => {
      if (saveResult.status === "fulfilled" && saveResult.value.saved) {
        savedToProblemBank += 1;
        if (saveResult.value.questionId) approvedQuestionIds.push(saveResult.value.questionId);
      } else {
        problemBankSaveFailures += 1;
      }
    });
    const cumulativeSavedCount = (Number(data.problemBankSavedCount) || 0) + savedToProblemBank;
    await owned.ref.update({
      problemBankSavedCount: cumulativeSavedCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await Promise.allSettled(approvedQuestionIds.map((questionId) => reportProblemBankUsage({
      questionId,
      workbookId: owned.snapshot.id,
    })));
    await recordProgress({
      phase: "global-problem-bank",
      status: problemBankSaveFailures ? "warning" : "completed",
      title: `${savedToProblemBank}개 신규 문항을 전역 문제은행에 반영했습니다`,
      summary: problemBankSaveFailures
        ? `${problemBankSaveFailures}개 문항은 승인·중복 검사 또는 API 연결을 통과하지 못했습니다.`
        : "raw 저장과 자동 검수를 통과한 문항이 approved 상태로 전환되었습니다.",
      details: [
        `이번 배치 승인 저장: ${savedToProblemBank}개`,
        `이번 배치 미반영: ${problemBankSaveFailures}개`,
        `누적 승인 저장: ${cumulativeSavedCount}개`,
      ],
    });
  }

  if (data.problemBankEnabled && isProblemBankConfigured()) {
    const createdAtMs = typeof data.createdAt?.toMillis === "function"
      ? data.createdAt.toMillis()
      : Date.now();
    await Promise.allSettled([
      reportProblemBankGenerationRun({
        generationRunId: sanitizeText(data.generationRunId, 100) || `XUG_${owned.snapshot.id}`,
        request,
        reusedQuestionCount: Number(data.reusedQuestionCount) || 0,
        generatedQuestionCount,
        rejectedQuestionCount,
        savedQuestionCount: (Number(data.problemBankSavedCount) || 0) + savedToProblemBank,
        modelsUsed: [...new Set([sanitizeText(data.model, 160), ...modelsUsed].filter(Boolean))],
        durationMs: Math.max(0, Date.now() - createdAtMs),
      }),
    ]);
  }

  await recordProgress({
    phase: "storage",
    status: "completed",
    title: `${accepted.length}개 문항을 안전하게 저장했습니다`,
    summary: `누적 ${acceptedCount}/${request.targetQuestionCount}문항 · 배치 ${batchNumber} 저장 완료`,
    details: accepted.length
      ? accepted.map((question, index) => `${existingQuestions.length + index + 1}번 문항 · ${question.questionType} · ${question.id}`)
      : ["이번 배치에서 저장된 문항은 없습니다."],
  });
  await recordProgress({
    phase: completed ? "complete" : failed ? "failed" : "batch",
    status: completed ? "completed" : failed ? "error" : "completed",
    title: completed
      ? "전체 문제 생성과 저장을 완료했습니다"
      : failed
        ? "세 번 연속 품질 검증을 통과하지 못해 자동 생성을 멈췄습니다"
        : `${batchNumber}번째 배치를 완료했습니다`,
    summary: completed
      ? `${acceptedCount}문항의 최종 문제 세트가 준비됐습니다.`
      : `통과 ${accepted.length}개 · 누적 ${acceptedCount}/${request.targetQuestionCount}문항`,
    details: [
      `누적 모델 생성 호출: ${(Number(data.modelCallCount) || 0) + result.modelCallCount}회`,
      `누적 품질 거부: ${rejectedQuestionCount}문항`,
      `전역 문제은행 재사용: ${Number(data.reusedQuestionCount) || 0}문항`,
      `전역 문제은행 신규 저장: ${(Number(data.problemBankSavedCount) || 0) + savedToProblemBank}문항`,
      `이번 배치 모델: ${modelsUsed.at(-1) || provider.model}`,
      `연속 빈 배치: ${consecutiveFailedBatches}회`,
    ],
  });
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
    if (req.method === "GET" && sanitizeText(req.query?.mode, 40) === "progress") {
      const progress = await loadProgressSnapshot(authUser.uid, id, Number(req.query?.after) || 0);
      if (!progress) {
        res.status(404).json({ error: "문제 생성 작업을 찾을 수 없습니다." });
        return;
      }
      res.status(200).json({ progress });
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
