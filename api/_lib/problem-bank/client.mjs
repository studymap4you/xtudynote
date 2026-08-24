import { getQuestionRule } from "../csat-question-engine/load-question-rules.mjs";
import { semanticFingerprint } from "../csat-question-engine/deduplicate-questions.mjs";

const REQUEST_TIMEOUT_MS = 10_000;

function text(value, maxLength = 20_000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function config(env = process.env) {
  const apiUrl = text(env.PROBLEM_BANK_API_URL, 1_000).replace(/\/+$/u, "");
  const token = text(env.PROBLEM_BANK_SERVICE_TOKEN, 2_000);
  return { apiUrl, token, enabled: Boolean(apiUrl && token) };
}

export function isProblemBankConfigured(env = process.env) {
  return config(env).enabled;
}

async function problemBankRequest(path, { method = "POST", body, env = process.env } = {}) {
  const settings = config(env);
  if (!settings.enabled) throw new Error("problem-bank-not-configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${settings.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${settings.token}`,
        "Content-Type": "application/json",
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`problem-bank-http-${response.status}:${text(payload?.error, 120) || "unknown"}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function difficultyNumber(targetLevel) {
  if (targetLevel === "high") return 5;
  if (targetLevel === "low") return 2;
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
    counts.set(questionType, Number(counts.get(questionType) || 0) + 1);
  }
  return counts;
}

export async function searchReusableProblemBankQuestions({
  request,
  questionTypePlan,
  workbookId,
  excludeQuestionIds = [],
  env = process.env,
}) {
  if (!isProblemBankConfigured(env)) return { enabled: false, questions: [], searches: [] };
  const typeRequests = [...countTypes(questionTypePlan)];
  const responses = await Promise.allSettled(typeRequests.map(([questionType, count]) => (
    problemBankRequest("/api/problems/search", {
      env,
      body: {
        subject: "english",
        language: "en",
        examFamily: "csat",
        grade: gradeNumber(request.targetGrade),
        questionType,
        difficulty: difficultyNumber(request.targetLevel),
        count,
        sourceText: text(request.userRequest, 8_000),
        conceptTags: [questionType],
        skillTags: request.requestedTypes || [],
        excludeQuestionIds,
        workbookId,
      },
    })
  )));
  const searches = [];
  const selected = [];
  const usedIds = new Set(excludeQuestionIds);
  responses.forEach((response, responseIndex) => {
    const [questionType, count] = typeRequests[responseIndex];
    if (response.status === "rejected") {
      searches.push({
        questionType,
        requestedCount: count,
        foundCount: 0,
        missingCount: count,
        searchMode: "unavailable",
        error: text(response.reason instanceof Error ? response.reason.message : response.reason, 180),
      });
      return;
    }
    const payload = response.value;
    searches.push({
      questionType,
      requestedCount: count,
      foundCount: Number(payload.foundCount) || 0,
      missingCount: Number(payload.missingCount) || count,
      searchMode: text(payload.searchMode, 80),
    });
    for (const entry of Array.isArray(payload.problems) ? payload.problems : []) {
      const problem = entry?.problem;
      const questionId = text(problem?.questionId, 120);
      if (!questionId || usedIds.has(questionId)) continue;
      selected.push(problem);
      usedIds.add(questionId);
      if (selected.length >= questionTypePlan.length) break;
    }
  });
  if (responses.length && responses.every((response) => response.status === "rejected")) {
    throw new Error("problem-bank-search-unavailable");
  }
  return { enabled: true, questions: selected, searches };
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
    evidence: {
      supportingSentence: undefined,
      reasoning: explanation,
    },
    qualityMetadata: {
      reusedFromProblemBank: true,
      problemBankQuestionId: text(problem?.questionId, 120),
      problemBankQualityScore: Number(problem?.qualityScore) || 0,
      problemBankSequence: sequence,
    },
  };
  return { ...question, semanticFingerprint: semanticFingerprint(question) };
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
  const payload = await problemBankRequest("/api/problems", {
    env,
    body: {
      subject: "english",
      language: "en",
      examFamily: "csat",
      grade: gradeNumber(request.targetGrade),
      questionType: question.questionType,
      difficulty: difficultyNumber(question.difficulty || request.targetLevel),
      sourceId: question.sourceId,
      passage: question.passage,
      question: question.stem,
      choices: (question.choices || []).map((choice) => choice.text),
      answer: question.answer,
      explanation: question.explanation,
      conceptTags: [question.questionType],
      skillTags: request.requestedTypes || [],
      generator: {
        provider,
        model,
        version: generationVersion,
      },
    },
  });
  const saved = ["approved", "gold"].includes(payload?.status);
  return {
    enabled: true,
    saved,
    status: payload?.status,
    transition: payload?.transition,
    questionId: text(payload?.problem?.questionId, 120),
  };
}

export async function reportProblemBankUsage({ questionId, workbookId, env = process.env }) {
  if (!isProblemBankConfigured(env)) return { enabled: false, recorded: false };
  return problemBankRequest(`/api/problems/${encodeURIComponent(questionId)}/usage`, {
    env,
    body: { workbookId },
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
  return problemBankRequest("/api/generation-runs", {
    env,
    body: {
      generationRunId,
      userRequest: text(request.userRequest, 8_000),
      requestedQuestionCount: request.targetQuestionCount,
      reusedQuestionCount,
      generatedQuestionCount,
      rejectedQuestionCount,
      savedQuestionCount,
      modelsUsed,
      durationMs,
    },
  });
}
