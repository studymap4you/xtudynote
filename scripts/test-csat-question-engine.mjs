import assert from "node:assert/strict";
import test from "node:test";
import { buildNextBatchTypes } from "../api/_lib/csat-question-engine/build-batch-plan.mjs";
import { normalizeCsatGenerationMode } from "../api/_lib/csat-question-engine/generation-mode.mjs";
import { loadQuestionRules } from "../api/_lib/csat-question-engine/load-question-rules.mjs";
import { parseUserRequest } from "../api/_lib/csat-question-engine/parse-user-request.mjs";
import { searchQuestionBank } from "../api/_lib/csat-question-engine/question-bank-repository.mjs";
import { runQuestionGenerationPipeline } from "../api/_lib/csat-question-engine/run-question-generation-pipeline.mjs";
import {
  problemBankProblemToLocalQuestion,
  problemBankProblemToStructuralReference,
  validateProblemBankProblemForReuse,
} from "../api/_lib/problem-bank/client.mjs";

function alphaWord(number) {
  let value = number + 1;
  let result = "";
  while (value > 0) {
    result = String.fromCharCode(97 + ((value - 1) % 26)) + result;
    value = Math.floor((value - 1) / 26);
  }
  return `concept${result}`;
}

function passage(seed) {
  const words = Array.from({ length: 112 }, (_, index) => alphaWord(seed * 150 + index));
  const supportingSentence = `${words.slice(0, 18).join(" ")}.`;
  return {
    supportingSentence,
    text: `${supportingSentence} ${words.slice(18, 65).join(" ")}. ${words.slice(65).join(" ")}.`,
  };
}

function mockQuestion(assignment, rules, seed, referenceId, difficulty, invalid = false) {
  const rule = rules.questionTypes.find((item) => item.id === assignment.questionType);
  const patterns = rule.preferred_distractor_patterns;
  const correctIndex = (seed % 5) + 1;
  const sourcePassage = passage(seed);
  return {
    questionType: assignment.questionType,
    difficulty,
    scoreSuggestion: 3,
    sourceId: assignment.sourceId,
    referenceQuestionIds: [referenceId],
    passage: sourcePassage.text,
    stem: invalid ? "분량을 채우기 위해 보강된 문항입니다." : `다음 글의 핵심 논리를 가장 정확하게 설명한 것은 무엇인가? 유형 ${assignment.questionType} ${seed}`,
    choices: Array.from({ length: 5 }, (_, index) => ({
      index: index + 1,
      text: `Option ${alphaWord(seed * 20 + index)} explains the relationship with a carefully controlled logical scope.`,
      isCorrect: index + 1 === correctIndex,
      ...(index + 1 === correctIndex ? {} : { distractorPattern: patterns[index % patterns.length] }),
      rationale: index + 1 === correctIndex
        ? "지문의 핵심 관계와 범위를 모두 정확하게 반영한 선택지이다."
        : "본문과 관련된 표현을 사용하지만 핵심 관계의 범위 또는 방향이 어긋난다.",
    })),
    answer: correctIndex,
    explanation: "지문의 첫 근거와 결론이 같은 논리 방향을 가리키므로 해당 선택지만 전체 내용을 포괄한다. 나머지 선택지는 일부 정보만 맞거나 범위와 인과 방향을 바꾸었다.",
    evidence: {
      supportingSentence: sourcePassage.supportingSentence,
      reasoning: "도입에서 제시한 핵심 개념이 결론에서 같은 범위로 재진술되는지를 연결해 판단한다.",
    },
  };
}

function providers() {
  return {
    sourceProvider: async ({ batchNumber }) => Array.from({ length: 5 }, (_, index) => ({
      id: `source-${batchNumber}-${index + 1}`,
      title: `Open source ${batchNumber}-${index + 1}`,
      sourceType: "paper",
      topic: ["education", "science"],
      text: passage(batchNumber * 10 + index).text,
      difficulty: "high",
      copyrightStatus: "CC BY 4.0",
    })),
    referenceProvider: async ({ targetTypes, batchNumber }) => targetTypes.map((questionType, index) => ({
      id: `reference-${batchNumber}-${index + 1}`,
      exam: "CSAT",
      year: 2026,
      questionNumber: 20 + index,
      questionType,
      score: 3,
      difficulty: "high",
      passageStructure: "핵심 주장과 근거를 연결한다.",
      answerStructure: "글 전체의 범위와 일치하는 선택지를 고른다.",
      distractorPatterns: ["범위 이동", "인과 왜곡"],
      reasoningStructure: ["도입과 결론의 반복 개념을 확인한다."],
    })),
  };
}

function deterministicIdFactory() {
  let index = 0;
  return () => `question-${String(++index).padStart(3, "0")}`;
}

test("생성 유형은 시험지만 명시적으로 허용하고 기존 작업은 교재로 복원한다", () => {
  assert.equal(normalizeCsatGenerationMode("exam"), "exam");
  assert.equal(normalizeCsatGenerationMode("textbook"), "textbook");
  assert.equal(normalizeCsatGenerationMode(undefined), "textbook");
  assert.equal(normalizeCsatGenerationMode("unknown"), "textbook");
});

test("전역 문제은행 유형을 기존 규칙 ID로 복원해 확보 문항을 다시 생성하지 않는다", () => {
  const reused = problemBankProblemToLocalQuestion({
    questionId: "XUQ_REUSED",
    questionType: "blank_short",
    difficulty: 4,
    sourceId: "XUS_SOURCE",
    passage: passage(900).text,
    question: "Which option best completes the blank?",
    choices: ["First", "Second", "Third", "Fourth", "Fifth"],
    answer: 2,
    explanation: "The second option is supported by the passage's contrast and conclusion.",
    qualityScore: 95,
  });
  assert.equal(reused.questionType, "BLANK_SHORT");
  assert.deepEqual(
    buildNextBatchTypes(["BLANK_SHORT", "MAIN_IDEA"], [reused], 2),
    ["MAIN_IDEA"],
  );
});

test("정책·품질 게이트를 통과한 문항만 시험지 원문항과 교재 구조 참고로 재사용한다", () => {
  const approved = {
    questionId: "QB54473_TEST_001",
    questionType: "blank_short",
    subtype: "빈칸 추론 - 단어형",
    difficulty: 4,
    sourceId: "qb54473_source_001",
    passage: passage(901).text,
    question: "Which option best completes the blank in the passage?",
    choices: ["First", "Second", "Third", "Fourth", "Fifth"],
    answer: 2,
    explanation: "두 번째 선택지만 빈칸 전후의 대조 관계와 결론을 함께 유지하므로 정답이다. 다른 선택지는 범위나 의미 방향이 달라진다.",
    evidence: { reasoning: "빈칸 앞의 대조와 마지막 결론이 같은 의미 방향을 요구한다." },
    choiceRationales: [
      { index: 1, isCorrect: false, distractorPattern: "PARTIAL_TRUTH", rationale: "일부 내용만 반영한다." },
      { index: 2, isCorrect: true, rationale: "본문의 핵심 관계를 보존한다." },
      { index: 3, isCorrect: false, distractorPattern: "ADJACENT_TOPIC", rationale: "인접 주제이지만 빈칸 논리와 다르다." },
      { index: 4, isCorrect: false, distractorPattern: "POLARITY_REVERSAL", rationale: "의미 방향을 반대로 바꾼다." },
      { index: 5, isCorrect: false, distractorPattern: "SCOPE_SHIFT", rationale: "본문보다 범위를 넓힌다." },
    ],
    status: "approved",
    policyStatus: "approved",
    qualityScore: 96,
    validation: { valid: true, policyPassed: true, qualityGateVersion: "source-grounded-import-v1" },
    reusePolicy: ["textbook-structure-reference", "exam-exact"],
    datasetId: "question-bank-54473-v1",
    transformation: { kind: "word-blank" },
  };
  assert.equal(validateProblemBankProblemForReuse(approved, "exam-exact").valid, true);
  assert.equal(validateProblemBankProblemForReuse({ ...approved, policyStatus: "needs_review" }, "exam-exact").valid, false);
  const reference = problemBankProblemToStructuralReference(approved);
  assert.equal(reference.questionType, "BLANK_SHORT");
  assert.equal(reference.sourceDatasetId, "question-bank-54473-v1");
  assert.doesNotMatch(JSON.stringify(reference), /conceptninehundred/u);
});

test("규칙 JSON과 5개년 문제은행 reference를 유형별로 순환한다", async () => {
  const rules = loadQuestionRules(["BLANK_SHORT"]);
  assert.equal(rules.version, "0.1");
  assert.deepEqual(rules.questionTypes[0].preferred_distractor_patterns.slice(0, 3), [
    "PARTIAL_TRUTH",
    "ADJACENT_TOPIC",
    "POLARITY_REVERSAL",
  ]);
  const docs = [2026, 2025, 2024, 2023, 2022].map((year) => ({
    id: `${year}-odd-31`,
    data: () => ({
      active: true,
      section: "reading",
      examYear: year,
      questionNumber: 31,
      questionType: "blank-inference",
      score: 3,
      analysis: { transferableLogic: "빈칸 전후의 논리를 연결한다.", generationRules: ["범위를 맞춘다."] },
    }),
  }));
  const firestore = {
    collection: () => ({
      where: () => ({
        limit: () => ({ get: async () => ({ docs }) }),
      }),
    }),
  };
  const first = await searchQuestionBank({ firestore, questionTypes: ["BLANK_SHORT"], rotation: 0 });
  const rotated = await searchQuestionBank({ firestore, questionTypes: ["BLANK_SHORT"], rotation: 3 });
  assert.deepEqual(first.map((item) => item.year), [2026, 2025, 2024]);
  assert.deepEqual(rotated.map((item) => item.year), [2023, 2022, 2026]);
});

test("TEST A: 고3 수능 영어 40문항을 1문항 배치로 완성한다", async () => {
  const request = parseUserRequest("고3 수능 영어 문제 40개 만들어줘.");
  const rules = loadQuestionRules();
  const { sourceProvider, referenceProvider } = providers();
  let modelCalls = 0;
  let seed = 0;
  const result = await runQuestionGenerationPipeline({
    request,
    rules,
    sourceProvider,
    referenceProvider,
    idFactory: deterministicIdFactory(),
    generateBatch: async ({ assignments, references, request: batchRequest }) => {
      modelCalls += 1;
      assert.equal(assignments.length, 1);
      return { questions: assignments.map((assignment) => mockQuestion(
        assignment,
        rules,
        ++seed,
        references.find((reference) => reference.questionType === assignment.questionType)?.id || references[0].id,
        batchRequest.targetLevel,
      )) };
    },
  });
  assert.equal(result.completed, true);
  assert.equal(result.questions.length, 40);
  assert.equal(result.batchCount, 40);
  assert.equal(result.modelCallCount, 40);
  assert.equal(modelCalls, 40);
  assert.equal(result.questions.some((question) => /보강|placeholder|filler/iu.test(question.stem)), false);
  assert.ok(new Set(result.questions.map((question) => question.sourceId)).size >= 20);
});

test("모든 요청은 1문항씩 생성하고 저장한다", async () => {
  const request = parseUserRequest("고3 수능 영어 문제 7개 만들어줘.");
  const rules = loadQuestionRules();
  const { sourceProvider, referenceProvider } = providers();
  const assignmentSizes = [];
  const progressStages = [];
  let seed = 50;
  const result = await runQuestionGenerationPipeline({
    request,
    rules,
    sourceProvider,
    referenceProvider,
    idFactory: deterministicIdFactory(),
    onProgress: async (event) => progressStages.push(event.stage),
    generateBatch: async ({ assignments, references, request: batchRequest }) => {
      assignmentSizes.push(assignments.length);
      return { questions: assignments.map((assignment) => mockQuestion(
        assignment,
        rules,
        ++seed,
        references.find((reference) => reference.questionType === assignment.questionType)?.id || references[0].id,
        batchRequest.targetLevel,
      )) };
    },
  });
  assert.equal(result.completed, true);
  assert.equal(result.questions.length, 7);
  assert.equal(result.batchCount, 7);
  assert.deepEqual(assignmentSizes, [1, 1, 1, 1, 1, 1, 1]);
  assert.ok(progressStages.includes("assignments-prepared"));
  assert.ok(progressStages.includes("generation-attempt-started"));
  assert.ok(progressStages.includes("model-response-parsed"));
  assert.ok(progressStages.includes("candidate-accepted"));
  assert.ok(progressStages.includes("validated-batch-completed"));
});

test("TEST B: 상위권 50문항은 빈칸·순서·삽입 유형만 우선한다", async () => {
  const request = parseUserRequest("고3 상위권 수능 영어 문제 50개 만들어줘. 빈칸, 순서, 삽입 중심으로 만들어줘.");
  const rules = loadQuestionRules();
  const { sourceProvider, referenceProvider } = providers();
  let seed = 100;
  const result = await runQuestionGenerationPipeline({
    request,
    rules,
    sourceProvider,
    referenceProvider,
    idFactory: deterministicIdFactory(),
    generateBatch: async ({ assignments, references, request: batchRequest }) => ({
      questions: assignments.map((assignment) => mockQuestion(
        assignment,
        rules,
        ++seed,
        references.find((reference) => reference.questionType === assignment.questionType)?.id || references[0].id,
        batchRequest.targetLevel,
      )),
    }),
  });
  const expectedTypes = new Set(["BLANK_SHORT", "BLANK_LONG", "PARAGRAPH_ORDER", "SENTENCE_INSERTION"]);
  assert.equal(result.completed, true);
  assert.equal(result.questions.length, 50);
  assert.equal(result.batchCount, 50);
  assert.equal(result.modelCallCount, 50);
  assert.ok(result.questions.every((question) => expectedTypes.has(question.questionType)));
  assert.ok(result.questions.every((question) => question.difficulty === "high"));
});

test("TEST C: 요지 문항의 거부 후보는 저장하지 않고 실제 재생성한다", async () => {
  const request = parseUserRequest("수능 영어 요지 문제 40개 만들어줘.");
  const rules = loadQuestionRules();
  const { sourceProvider, referenceProvider } = providers();
  let call = 0;
  let seed = 300;
  const result = await runQuestionGenerationPipeline({
    request,
    rules,
    sourceProvider,
    referenceProvider,
    idFactory: deterministicIdFactory(),
    generateBatch: async ({ assignments, generationAttempt, references, request: batchRequest }) => {
      call += 1;
      assert.equal(assignments.length, 1);
      return {
        questions: assignments.map((assignment, index) => mockQuestion(
          assignment,
          rules,
          ++seed,
          references.find((reference) => reference.questionType === assignment.questionType)?.id || references[0].id,
          batchRequest.targetLevel,
          generationAttempt === 1 && index === 0,
        )),
      };
    },
  });
  assert.equal(result.completed, true);
  assert.equal(result.questions.length, 40);
  assert.ok(result.retryCount >= 20);
  assert.ok(result.rejectedCount >= 20);
  assert.ok(call > 20);
  assert.ok(result.questions.every((question) => question.questionType === "MAIN_IDEA"));
  assert.ok(result.questions.every((question) => question.choices.filter((choice) => !choice.isCorrect).every((choice) => choice.distractorPattern)));
  assert.equal(result.questions.some((question) => /보강|placeholder|filler/iu.test(question.stem)), false);
});
