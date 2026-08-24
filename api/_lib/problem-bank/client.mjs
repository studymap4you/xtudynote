import { createHash, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getQuestionRule } from "../csat-question-engine/load-question-rules.mjs";
import { semanticFingerprint } from "../csat-question-engine/deduplicate-questions.mjs";
import { getProblemBankFirestore, problemBankSettings } from "./admin.mjs";

function text(value, maxLength = 20_000) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function cleanComparable(value) {
  return text(value, 100_000)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizedTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 80).toLowerCase()).filter(Boolean))].slice(0, 30);
}

function removeUndefined(value) {
  if (Array.isArray(value)) return value.map(removeUndefined);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, removeUndefined(child)]),
  );
}

function documentId(namespace, permanentId) {
  const digest = createHash("sha256").update(`${namespace}:${permanentId}`).digest("hex").slice(0, 32);
  return `${namespace}_${digest}`;
}

function permanentId(prefix) {
  return `${prefix}_${Date.now().toString(36).toUpperCase()}${randomBytes(8).toString("hex").toUpperCase()}`;
}

function embeddingFeatures(value) {
  const tokens = text(value, 80_000)
    .toLowerCase()
    .normalize("NFKC")
    .match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || [];
  const features = tokens.map((token) => ({ value: `t:${token}`, weight: 1 }));
  for (let index = 0; index < tokens.length - 1; index += 1) {
    features.push({ value: `b:${tokens[index]}_${tokens[index + 1]}`, weight: 0.65 });
  }
  return features;
}

function hashEmbedding(value, dimension = 256) {
  const vector = Array.from({ length: dimension }, () => 0);
  for (const feature of embeddingFeatures(value)) {
    const digest = createHash("sha256").update(feature.value).digest();
    const bucket = digest.readUInt32BE(0) % dimension;
    vector[bucket] += (digest[4] % 2 === 0 ? 1 : -1) * feature.weight;
  }
  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item ** 2, 0));
  return norm ? vector.map((item) => Number((item / norm).toFixed(8))) : vector;
}

function vectorArray(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (value && typeof value.toArray === "function") {
    const result = value.toArray();
    return Array.isArray(result) ? result.map(Number) : [];
  }
  return [];
}

function cosineSimilarity(left, right) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (!leftNorm || !rightNorm) return 0;
  return Math.max(-1, Math.min(1, dot / Math.sqrt(leftNorm * rightNorm)));
}

function tagOverlap(left = [], right = []) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return left.filter((tag) => rightSet.has(tag)).length / new Set([...left, ...right]).size;
}

function timestampDate(value) {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function problemFromData(data = {}) {
  return {
    questionId: text(data.questionId, 120),
    subject: text(data.subject, 80),
    language: text(data.language, 20),
    examFamily: text(data.examFamily, 80),
    grade: Number.isInteger(data.grade) ? Number(data.grade) : undefined,
    questionType: text(data.questionType, 120),
    subtype: text(data.subtype, 120) || undefined,
    difficulty: Number(data.difficulty) || 0,
    sourceId: text(data.sourceId, 200) || undefined,
    passage: text(data.passage, 30_000) || undefined,
    question: text(data.question, 4_000),
    choices: Array.isArray(data.choices) ? data.choices.map((choice) => text(choice, 2_000)) : [],
    answer: typeof data.answer === "number" ? data.answer : text(data.answer, 2_000),
    explanation: text(data.explanation, 12_000) || undefined,
    conceptTags: normalizedTags(data.conceptTags),
    skillTags: normalizedTags(data.skillTags),
    qualityScore: Number(data.qualityScore) || 0,
    status: text(data.status, 40),
    validation: data.validation || {},
    generator: data.generator,
    embedding: vectorArray(data.embedding),
    contentFingerprint: text(data.contentFingerprint, 100),
    duplicateClusterId: text(data.duplicateClusterId, 120) || undefined,
    usageCount: Number(data.usageCount) || 0,
    lastUsedAt: data.lastUsedAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function problemScore(problem, query, semanticSimilarity) {
  const semantic = Math.max(0, Math.min(1, (semanticSimilarity + 1) / 2));
  const difficulty = Math.max(0, 1 - Math.abs(problem.difficulty - query.difficulty) / 4);
  const concepts = Math.max(
    tagOverlap(problem.conceptTags, query.conceptTags),
    tagOverlap(problem.skillTags, query.skillTags),
  );
  const quality = Math.max(0, Math.min(1, problem.qualityScore / 100));
  const usageDiversity = 1 / (1 + Math.log2(problem.usageCount + 1));
  const elapsedDays = Math.max(0, (Date.now() - timestampDate(problem.lastUsedAt).getTime()) / 86_400_000);
  const recentPenalty = problem.lastUsedAt
    ? elapsedDays < 1 ? 1 : elapsedDays < 7 ? 0.6 : elapsedDays < 30 ? 0.25 : 0
    : 0;
  return semantic * 0.48
    + (problem.questionType === query.questionType ? 1 : 0) * 0.15
    + difficulty * 0.12
    + concepts * 0.08
    + quality * 0.12
    + usageDiversity * 0.05
    - recentPenalty * 0.12;
}

function queryEmbeddingText(query) {
  return [
    query.subject,
    query.examFamily,
    query.questionType,
    query.sourceText,
    ...(query.conceptTags || []),
    ...(query.skillTags || []),
  ].filter(Boolean).join("\n");
}

function problemEmbeddingText(problem) {
  return [
    problem.subject,
    problem.examFamily,
    problem.questionType,
    problem.subtype,
    problem.passage,
    problem.question,
    ...(problem.choices || []),
    ...(problem.conceptTags || []),
    ...(problem.skillTags || []),
  ].filter(Boolean).join("\n");
}

export function isProblemBankConfigured(env = process.env) {
  return problemBankSettings(env).enabled;
}

function difficultyNumber(targetLevel) {
  if (targetLevel === "high") return 5;
  if (targetLevel === "low") return 2;
  if (Number.isInteger(Number(targetLevel))) return Math.max(1, Math.min(5, Number(targetLevel)));
  return 3;
}

function gradeNumber(targetGrade) {
  const koreanHighSchool = Number(String(targetGrade || "").match(/[1-3]/u)?.[0]);
  if (koreanHighSchool >= 1 && koreanHighSchool <= 3) return 9 + koreanHighSchool;
  const numeric = Number(String(targetGrade || "").match(/\d{1,2}/u)?.[0]);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 12 ? numeric : 12;
}

function countTypes(questionTypePlan) {
  const counts = new Map();
  for (const questionType of questionTypePlan) {
    const normalized = text(questionType, 120).toLowerCase();
    counts.set(normalized, Number(counts.get(normalized) || 0) + 1);
  }
  return [...counts];
}

async function searchProblemType({ request, questionType, count, excludeQuestionIds, env }) {
  const firestore = getProblemBankFirestore(env);
  const query = {
    subject: "english",
    language: "en",
    examFamily: "csat",
    questionType,
    difficulty: difficultyNumber(request.targetLevel),
    sourceText: text(request.userRequest, 8_000),
    conceptTags: [questionType],
    skillTags: normalizedTags(request.requestedTypes),
  };
  const snapshot = await firestore
    .collection("problems")
    .where("subject", "==", query.subject)
    .where("language", "==", query.language)
    .where("examFamily", "==", query.examFamily)
    .where("questionType", "==", query.questionType)
    .where("status", "in", ["approved", "gold"])
    .limit(Math.min(200, Math.max(20, count * 8)))
    .get();
  const queryVector = hashEmbedding(queryEmbeddingText(query));
  const excluded = new Set(excludeQuestionIds);
  const selectedClusters = new Set();
  const candidates = snapshot.docs
    .map((doc) => problemFromData(doc.data()))
    .filter((problem) => problem.questionId && !excluded.has(problem.questionId))
    .map((problem) => ({ problem, similarity: cosineSimilarity(problem.embedding, queryVector) }))
    .map((candidate) => ({ ...candidate, score: problemScore(candidate.problem, query, candidate.similarity) }))
    .sort((left, right) => right.score - left.score || left.problem.questionId.localeCompare(right.problem.questionId));
  const selected = [];
  for (const candidate of candidates) {
    const clusterId = candidate.problem.duplicateClusterId;
    if (clusterId && selectedClusters.has(clusterId)) continue;
    selected.push(candidate.problem);
    if (clusterId) selectedClusters.add(clusterId);
    if (selected.length >= count) break;
  }
  return selected;
}

export async function searchReusableProblemBankQuestions({
  request,
  questionTypePlan,
  excludeQuestionIds = [],
  env = process.env,
}) {
  if (!isProblemBankConfigured(env)) return { enabled: false, questions: [], searches: [] };
  const typeRequests = countTypes(questionTypePlan);
  const responses = await Promise.allSettled(typeRequests.map(([questionType, count]) => (
    searchProblemType({ request, questionType, count, excludeQuestionIds, env })
  )));
  const searches = [];
  const questions = [];
  const usedIds = new Set(excludeQuestionIds);
  responses.forEach((response, index) => {
    const [questionType, requestedCount] = typeRequests[index];
    if (response.status === "rejected") {
      searches.push({
        questionType,
        requestedCount,
        foundCount: 0,
        missingCount: requestedCount,
        searchMode: "unavailable",
        error: text(response.reason instanceof Error ? response.reason.message : response.reason, 180),
      });
      return;
    }
    const selected = response.value;
    searches.push({
      questionType,
      requestedCount,
      foundCount: selected.length,
      missingCount: Math.max(0, requestedCount - selected.length),
      searchMode: "direct-firestore",
    });
    for (const problem of selected) {
      if (!problem.questionId || usedIds.has(problem.questionId)) continue;
      questions.push(problem);
      usedIds.add(problem.questionId);
    }
  });
  if (responses.length && responses.every((response) => response.status === "rejected")) {
    throw new Error("problem-bank-search-unavailable");
  }
  return { enabled: true, questions, searches };
}

function answerIndex(problem, choices) {
  const numeric = Number(problem?.answer);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length) return numeric;
  const answerText = text(problem?.answer, 2_000).toLowerCase();
  const index = choices.findIndex((choice) => choice.toLowerCase() === answerText);
  return index >= 0 ? index + 1 : 0;
}

export function problemBankProblemToLocalQuestion(problem, sequence = 0) {
  const choices = Array.isArray(problem?.choices)
    ? problem.choices.map((choice) => text(choice, 2_000)).filter(Boolean).slice(0, 5)
    : [];
  const answer = answerIndex(problem, choices);
  const questionType = text(problem?.questionType, 120).toUpperCase();
  const rule = getQuestionRule(questionType);
  const patterns = rule?.preferred_distractor_patterns || ["scope_shift"];
  const explanation = text(problem?.explanation, 5_000);
  const question = {
    id: text(problem?.questionId, 120),
    questionType,
    difficulty: Number(problem?.difficulty) >= 5 ? "high" : Number(problem?.difficulty) <= 2 ? "low" : "medium",
    scoreSuggestion: Number(problem?.difficulty) >= 4 ? 3 : 2,
    sourceId: text(problem?.sourceId, 200) || "global-problem-bank",
    referenceQuestionIds: [],
    passage: text(problem?.passage, 12_000),
    stem: text(problem?.question, 1_500),
    choices: choices.map((choice, index) => ({
      index: index + 1,
      text: choice,
      isCorrect: answer === index + 1,
      distractorPattern: answer === index + 1 ? undefined : patterns[index % patterns.length],
      rationale: answer === index + 1
        ? explanation || "문제은행의 검증된 정답입니다."
        : "문제은행 검수 단계에서 오답으로 확인된 선택지입니다.",
    })),
    answer,
    explanation,
    evidence: { supportingSentence: undefined, reasoning: explanation },
    qualityMetadata: {
      reusedFromProblemBank: true,
      problemBankQuestionId: text(problem?.questionId, 120),
      problemBankQualityScore: Number(problem?.qualityScore) || 0,
      problemBankSequence: sequence,
    },
  };
  return { ...question, semanticFingerprint: semanticFingerprint(question) };
}

function normalizedProblemDraft({ question, request, provider, model, generationVersion }) {
  const choices = Array.isArray(question.choices)
    ? question.choices.map((choice) => text(choice?.text ?? choice, 2_000)).filter(Boolean).slice(0, 8)
    : [];
  const answer = Number.isInteger(Number(question.answer)) ? Number(question.answer) : text(question.answer, 2_000);
  return {
    questionId: text(question.id, 80) || permanentId("XUQ"),
    subject: "english",
    language: "en",
    examFamily: "csat",
    grade: gradeNumber(request.targetGrade),
    questionType: text(question.questionType, 120).toLowerCase(),
    difficulty: difficultyNumber(question.difficulty || request.targetLevel),
    sourceId: text(question.sourceId, 100) || undefined,
    passage: text(question.passage, 30_000) || undefined,
    question: text(question.stem, 4_000),
    choices,
    answer,
    explanation: text(question.explanation, 12_000) || undefined,
    conceptTags: normalizedTags([question.questionType]),
    skillTags: normalizedTags(request.requestedTypes),
    generator: removeUndefined({ provider, model, version: generationVersion }),
  };
}

function validateProblem(problem) {
  const issues = [];
  const choices = problem.choices || [];
  const answerPresent = typeof problem.answer === "number"
    ? Number.isInteger(problem.answer) && problem.answer >= 1 && problem.answer <= choices.length
    : text(problem.answer, 2_000).length > 0;
  const explanationPresent = (problem.explanation?.length || 0) >= 20;
  if (!answerPresent) issues.push("answer_missing_or_invalid");
  if (!explanationPresent) issues.push("explanation_missing_or_too_short");
  if (!problem.questionType) issues.push("question_type_missing");
  if (problem.question.length < 5) issues.push("question_too_short");
  if (!Number.isInteger(problem.difficulty) || problem.difficulty < 1 || problem.difficulty > 5) {
    issues.push("difficulty_out_of_range");
  }
  if (problem.examFamily === "csat" && choices.length !== 5) issues.push("csat_requires_five_choices");
  if (new Set(choices.map((choice) => choice.toLowerCase())).size !== choices.length) issues.push("duplicate_choices");
  const wordCount = (problem.passage?.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/gu) || []).length;
  if (problem.passage && wordCount < 35) issues.push("passage_too_short");
  const structurallyValid = !issues.some((issue) => ![
    "answer_missing_or_invalid",
    "explanation_missing_or_too_short",
  ].includes(issue));
  const qualityScore = Math.min(100,
    (structurallyValid ? 35 : 0)
    + (answerPresent ? 25 : 0)
    + (explanationPresent ? 25 : 0)
    + (problem.passage && wordCount >= 80 ? 10 : 0)
    + (problem.conceptTags.length || problem.skillTags.length ? 5 : 0));
  return {
    approved: answerPresent && explanationPresent && structurallyValid,
    qualityScore,
    validation: { answerPresent, explanationPresent, structurallyValid, issues },
  };
}

function problemFingerprint(problem) {
  const comparable = [problem.passage, problem.question, ...(problem.choices || [])]
    .map(cleanComparable)
    .join("\n");
  return createHash("sha256").update(comparable).digest("hex");
}

export async function saveGeneratedQuestionToProblemBank({
  question,
  request,
  provider,
  model,
  generationVersion,
  env = process.env,
}) {
  if (!isProblemBankConfigured(env)) return { enabled: false, saved: false };
  const firestore = getProblemBankFirestore(env);
  const draft = normalizedProblemDraft({ question, request, provider, model, generationVersion });
  const ref = firestore.collection("problems").doc(documentId("problem", draft.questionId));
  const existing = await ref.get();
  if (existing.exists) {
    const problem = problemFromData(existing.data());
    return {
      enabled: true,
      saved: ["approved", "gold"].includes(problem.status),
      status: problem.status,
      transition: "existing",
      questionId: problem.questionId,
    };
  }
  const now = new Date();
  const fingerprint = problemFingerprint(draft);
  await ref.create(removeUndefined({
    ...draft,
    qualityScore: 0,
    status: "raw",
    validation: { answerPresent: false, explanationPresent: false, structurallyValid: false },
    embedding: FieldValue.vector(hashEmbedding(problemEmbeddingText(draft))),
    contentFingerprint: fingerprint,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  }));
  const validation = validateProblem(draft);
  if (!validation.approved) {
    await ref.update({
      qualityScore: validation.qualityScore,
      status: "rejected",
      validation: validation.validation,
      updatedAt: new Date(),
    });
    return {
      enabled: true,
      saved: false,
      status: "rejected",
      transition: "raw_to_rejected",
      questionId: draft.questionId,
    };
  }
  const duplicates = await firestore.collection("problems")
    .where("contentFingerprint", "==", fingerprint)
    .limit(6)
    .get();
  const duplicate = duplicates.docs
    .map((doc) => problemFromData(doc.data()))
    .find((problem) => problem.questionId !== draft.questionId && problem.status !== "rejected");
  if (duplicate) {
    const clusterId = duplicate.duplicateClusterId || permanentId("XUC");
    const batch = firestore.batch();
    batch.update(ref, {
      qualityScore: validation.qualityScore,
      status: "duplicate",
      validation: validation.validation,
      duplicateClusterId: clusterId,
      updatedAt: new Date(),
    });
    const canonicalRef = firestore.collection("problems").doc(documentId("problem", duplicate.questionId));
    batch.set(canonicalRef, { duplicateClusterId: clusterId, updatedAt: new Date() }, { merge: true });
    batch.set(firestore.collection("duplicate_clusters").doc(documentId("cluster", clusterId)), {
      clusterId,
      canonicalQuestionId: duplicate.questionId,
      memberQuestionIds: FieldValue.arrayUnion(duplicate.questionId, draft.questionId),
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });
    await batch.commit();
    return {
      enabled: true,
      saved: false,
      status: "duplicate",
      transition: "raw_to_duplicate",
      questionId: draft.questionId,
    };
  }
  await ref.update({
    qualityScore: validation.qualityScore,
    status: "approved",
    validation: validation.validation,
    updatedAt: new Date(),
  });
  return {
    enabled: true,
    saved: true,
    status: "approved",
    transition: "raw_to_approved",
    questionId: draft.questionId,
  };
}

export async function reportProblemBankUsage({ questionId, workbookId, env = process.env }) {
  if (!isProblemBankConfigured(env)) return { enabled: false, recorded: false };
  const firestore = getProblemBankFirestore(env);
  const eventRef = firestore.collection("usage_events").doc(documentId("usage", `${workbookId}:${questionId}`));
  const problemRef = firestore.collection("problems").doc(documentId("problem", questionId));
  return firestore.runTransaction(async (transaction) => {
    const [eventSnapshot, problemSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(problemRef),
    ]);
    if (eventSnapshot.exists || !problemSnapshot.exists) return { enabled: true, recorded: false };
    const timestamp = new Date();
    transaction.create(eventRef, {
      eventId: permanentId("XUE"),
      questionId,
      workbookId,
      timestamp,
    });
    transaction.update(problemRef, {
      usageCount: FieldValue.increment(1),
      lastUsedAt: timestamp,
      updatedAt: timestamp,
    });
    return { enabled: true, recorded: true };
  });
}

export async function reportProblemBankGenerationRun({
  generationRunId,
  request,
  reusedQuestionCount,
  generatedQuestionCount,
  rejectedQuestionCount,
  savedQuestionCount,
  modelsUsed,
  durationMs,
  env = process.env,
}) {
  if (!isProblemBankConfigured(env)) return { enabled: false };
  const firestore = getProblemBankFirestore(env);
  const ref = firestore.collection("generation_runs").doc(documentId("generation", generationRunId));
  const snapshot = await ref.get();
  await ref.set(removeUndefined({
    generationRunId,
    userRequest: text(request.userRequest, 8_000),
    requestedQuestionCount: request.targetQuestionCount,
    reusedQuestionCount,
    generatedQuestionCount,
    rejectedQuestionCount,
    savedQuestionCount,
    modelsUsed,
    durationMs,
    updatedAt: new Date(),
    createdAt: snapshot.exists ? snapshot.get("createdAt") : new Date(),
  }), { merge: true });
  return { enabled: true, generationRunId };
}
