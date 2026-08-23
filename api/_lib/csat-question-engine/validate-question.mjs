import { randomUUID } from "node:crypto";
import {
  findDuplicateQuestion,
  jaccardSimilarity,
  normalizeComparableText,
  semanticFingerprint,
} from "./deduplicate-questions.mjs";
import { getQuestionRule, SUPPORTED_DISTRACTOR_PATTERNS } from "./load-question-rules.mjs";

const FILLER_PATTERNS = [
  /보강(?:된|한)?\s*문항/u,
  /문항\s*수가\s*부족/u,
  /분량을\s*(?:채우|맞추)/u,
  /placeholder/iu,
  /filler/iu,
  /사용자가\s*입력한\s*내용/u,
];

function text(value, maxLength = 20_000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function answerIndex(value, choices) {
  const numeric = Number(String(value ?? "").match(/[1-5]/u)?.[0]);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 5) return numeric;
  const normalized = text(value).toLowerCase();
  const matchingChoice = choices.find((choice) => choice.text.toLowerCase() === normalized);
  if (matchingChoice) return matchingChoice.index;
  const marked = choices.filter((choice) => choice.isCorrect === true);
  return marked.length === 1 ? marked[0].index : 0;
}

function normalizeChoice(value, index) {
  return {
    index: Number(value?.index) || index + 1,
    text: text(value?.text, 1_500),
    isCorrect: value?.isCorrect === true,
    distractorPattern: text(value?.distractorPattern, 80) || undefined,
    rationale: text(value?.rationale, 1_500),
  };
}

export function normalizeGeneratedQuestion(raw, context = {}) {
  const choices = Array.isArray(raw?.choices) ? raw.choices.slice(0, 5).map(normalizeChoice) : [];
  const answer = answerIndex(raw?.answer, choices);
  const validReferenceIds = new Set(context.validReferenceIds || []);
  const rawCorrectChoices = choices.filter((choice) => choice.isCorrect);
  const normalizedChoices = choices.map((choice, index) => ({
    ...choice,
    index: index + 1,
    isCorrect: answer === index + 1,
  }));
  const question = {
    id: text(raw?.id, 120) || context.idFactory?.() || randomUUID(),
    questionType: text(raw?.questionType, 80),
    difficulty: ["low", "medium", "high"].includes(raw?.difficulty) ? raw.difficulty : context.difficulty,
    scoreSuggestion: Number(raw?.scoreSuggestion) === 3 ? 3 : 2,
    sourceId: text(raw?.sourceId, 200),
    referenceQuestionIds: Array.isArray(raw?.referenceQuestionIds)
      ? raw.referenceQuestionIds
          .map((item) => text(item, 120))
          .filter((item) => item && (!validReferenceIds.size || validReferenceIds.has(item)))
          .slice(0, 8)
      : [],
    passage: text(raw?.passage, 12_000),
    stem: text(raw?.stem, 1_500),
    choices: normalizedChoices,
    answer,
    explanation: text(raw?.explanation, 5_000),
    evidence: {
      supportingSentence: text(raw?.evidence?.supportingSentence, 2_000) || undefined,
      reasoning: text(raw?.evidence?.reasoning, 3_000),
    },
    qualityMetadata: {
      batchId: text(context.batchId, 120),
      generationAttempt: Number(context.generationAttempt) || 1,
      rawCorrectCount: rawCorrectChoices.length,
      rawAnswerConsistent: rawCorrectChoices.length === 1 && rawCorrectChoices[0].index === answer,
    },
  };
  return { ...question, semanticFingerprint: semanticFingerprint(question) };
}

function englishWordCount(value) {
  return (String(value ?? "").match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || []).length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function evidenceOverlap(question) {
  const supporting = question.evidence.supportingSentence;
  if (!supporting) return 0;
  if (normalizeComparableText(question.passage).includes(normalizeComparableText(supporting))) return 1;
  return jaccardSimilarity(supporting, question.passage);
}

export function validateQuestion(question, context = {}) {
  const issues = [];
  const rule = getQuestionRule(question.questionType);
  const validSourceIds = new Set(context.validSourceIds || []);
  const allowedTypes = new Set(context.allowedTypes || []);
  const validReferenceIds = new Set(context.validReferenceIds || []);
  const matchingReferenceIds = new Set(context.referenceIdsByType?.[question.questionType] || []);

  if (!rule) issues.push("지원하지 않는 문제 유형입니다.");
  if (allowedTypes.size && !allowedTypes.has(question.questionType)) issues.push("이번 배치에 요청되지 않은 문제 유형입니다.");
  if (!question.sourceId || (validSourceIds.size && !validSourceIds.has(question.sourceId))) {
    issues.push("Source DB 근거가 올바르지 않습니다.");
  }
  if (validReferenceIds.size && question.referenceQuestionIds.length === 0) {
    issues.push("실제 수능 문제은행 reference가 기록되지 않았습니다.");
  }
  if (matchingReferenceIds.size && !question.referenceQuestionIds.some((id) => matchingReferenceIds.has(id))) {
    issues.push("문제 유형과 일치하는 수능 문제은행 reference가 없습니다.");
  }
  if (context.difficulty && question.difficulty !== context.difficulty) {
    issues.push("사용자가 요청한 난이도와 일치하지 않습니다.");
  }
  if (!question.stem || question.stem.length < 7) issues.push("발문이 불완전합니다.");
  const wordCount = englishWordCount(question.passage);
  const minimumWords = question.questionType.startsWith("LONG_READING") ? 180 : 80;
  if (wordCount < minimumWords) issues.push(`영어 지문이 너무 짧습니다(${wordCount}단어).`);
  if (wordCount > 650) issues.push(`영어 지문이 너무 깁니다(${wordCount}단어).`);
  if (question.choices.length !== 5) issues.push("5지선다 선택지가 정확히 5개가 아닙니다.");
  if (!Number.isInteger(question.answer) || question.answer < 1 || question.answer > 5) {
    issues.push("정답 번호가 1~5 중 하나가 아닙니다.");
  }
  if (question.choices.filter((choice) => choice.isCorrect).length !== 1) {
    issues.push("정답 선택지가 정확히 하나가 아닙니다.");
  }
  if (question.qualityMetadata.rawCorrectCount !== 1 || !question.qualityMetadata.rawAnswerConsistent) {
    issues.push("모델이 표시한 정답과 answer 값이 정확히 일치하지 않습니다.");
  }
  if (new Set(question.choices.map((choice) => choice.text.toLowerCase())).size !== question.choices.length) {
    issues.push("중복 선택지가 있습니다.");
  }

  const preferredPatterns = new Set(rule?.preferred_distractor_patterns || []);
  const distractors = question.choices.filter((choice) => !choice.isCorrect);
  const usedPatterns = new Set();
  for (const choice of question.choices) {
    if (!choice.text || choice.text.length < 2) issues.push(`${choice.index}번 선택지가 비어 있습니다.`);
    if (!choice.rationale || choice.rationale.length < 8) issues.push(`${choice.index}번 선택지의 근거 설명이 부족합니다.`);
    if (!choice.isCorrect) {
      if (!SUPPORTED_DISTRACTOR_PATTERNS.includes(choice.distractorPattern)) {
        issues.push(`${choice.index}번 오답의 distractor pattern이 유효하지 않습니다.`);
      } else if (preferredPatterns.size && !preferredPatterns.has(choice.distractorPattern)) {
        issues.push(`${choice.index}번 오답이 유형별 우선 distractor pattern을 따르지 않습니다.`);
      } else {
        usedPatterns.add(choice.distractorPattern);
      }
    }
  }
  if (preferredPatterns.size > 1 && usedPatterns.size < 2) issues.push("오답 패턴이 한 방식으로 지나치게 반복됩니다.");
  if (distractors.length !== 4) issues.push("오답 선택지가 정확히 네 개가 아닙니다.");

  const choiceLengths = question.choices.map((choice) => choice.text.length);
  const medianLength = median(choiceLengths);
  const correctLength = question.choices.find((choice) => choice.isCorrect)?.text.length || 0;
  if (medianLength && (correctLength > medianLength * 2.5 || correctLength < medianLength * 0.35)) {
    issues.push("정답 선택지 길이가 다른 선택지와 지나치게 다릅니다.");
  }
  if (question.explanation.length < 40) issues.push("정답 해설이 충분하지 않습니다.");
  if (question.evidence.reasoning.length < 25) issues.push("정답 근거의 추론 설명이 충분하지 않습니다.");
  if (question.evidence.supportingSentence && evidenceOverlap(question) < 0.35) {
    issues.push("제시한 근거 문장을 지문에서 확인하기 어렵습니다.");
  }

  const combined = `${question.stem}\n${question.passage}\n${question.explanation}`;
  if (FILLER_PATTERNS.some((pattern) => pattern.test(combined))) issues.push("placeholder/filler 문구가 포함되어 있습니다.");
  const userRequest = text(context.userRequest, 8_000);
  if (userRequest.length >= 20 && jaccardSimilarity(userRequest, combined) >= 0.72) {
    issues.push("사용자 주문 문장이 문제 내용으로 복사되었습니다.");
  }

  const duplicate = findDuplicateQuestion(question, context.existingQuestions || []);
  if (duplicate.duplicate) issues.push(`기존 문제와 중복됩니다(${duplicate.reason}).`);
  return { valid: issues.length === 0, issues };
}
