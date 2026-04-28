import { SIGNAL_LOGIC_OPENAI_MODEL_FALLBACK } from "@/config/signalLogicAnalysisPrompt";
import {
  SHORT_ANSWER_GRADE_SYSTEM,
  buildShortAnswerGradeUserPrompt,
} from "@/config/shortAnswerGradingPrompt";
import type { ShortAnswerEvaluation } from "@/types/studentAnswers";
import { assertMaxSentences } from "@/lib/exam/validateAnswerSentences";

const MAX_SHORT_SENTENCES = 2;
const KEYWORD_PENALTY_PER_TERM = 12;
const PASS_SCORE = 70;

function readOpenAiKey(): string {
  return String(import.meta.env.VITE_OPENAI_API_KEY ?? "").trim();
}

function readOpenAiModel(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || SIGNAL_LOGIC_OPENAI_MODEL_FALLBACK;
}

/** 대소문자 무시·부분 일치: 키워드가 학생 답안에 포함되는지 */
export function findMissingKeywords(studentAnswer: string, requiredKeywords: string[]): string[] {
  const lower = studentAnswer.trim().toLowerCase();
  const missing: string[] = [];
  for (const raw of requiredKeywords) {
    const k = raw.trim();
    if (!k) continue;
    if (!lower.includes(k.toLowerCase())) missing.push(k);
  }
  return missing;
}

type RawAiGrade = { semanticScore?: number; comment?: string };

function parseGradeJson(content: string): RawAiGrade {
  try {
    const o = JSON.parse(content) as RawAiGrade;
    return typeof o === "object" && o !== null ? o : {};
  } catch {
    return {};
  }
}

/**
 * 단답형 AI 채점: 2문장 제한 → 키워드 누락 감지 → OpenAI 의미 점수 → 감점 후 isCorrect 판정.
 */
export async function evaluateShortAnswer(input: {
  studentAnswer: string;
  modelAnswer: string;
  requiredKeywords: string[];
  questionPrompt: string;
}): Promise<ShortAnswerEvaluation> {
  const sentenceGate = assertMaxSentences(input.studentAnswer.trim(), MAX_SHORT_SENTENCES);
  if (!sentenceGate.ok) {
    return {
      isCorrect: false,
      score: 0,
      comment: sentenceGate.message,
    };
  }

  const missing = findMissingKeywords(input.studentAnswer, input.requiredKeywords);
  const penalty = KEYWORD_PENALTY_PER_TERM * missing.length;

  const apiKey = readOpenAiKey();
  if (!apiKey) {
    return {
      isCorrect: false,
      score: 0,
      comment:
        "OpenAI API 키가 설정되지 않아 채점할 수 없습니다. 관리자에게 문의하거나 .env.local의 VITE_OPENAI_API_KEY를 확인해 주세요.",
      missingKeywords: missing.length ? missing : undefined,
    };
  }

  const model = readOpenAiModel();
  const user = buildShortAnswerGradeUserPrompt({
    questionPrompt: input.questionPrompt,
    modelAnswer: input.modelAnswer,
    studentAnswer: input.studentAnswer,
    requiredKeywords: input.requiredKeywords,
    missingKeywords: missing,
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SHORT_ANSWER_GRADE_SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return {
      isCorrect: false,
      score: 0,
      comment: `채점 API 오류: ${t.slice(0, 200) || res.status}`,
      missingKeywords: missing.length ? missing : undefined,
    };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseGradeJson(content);
  let semantic = Number(parsed.semanticScore);
  if (!Number.isFinite(semantic)) semantic = 0;
  semantic = Math.max(0, Math.min(100, Math.round(semantic)));

  let score = Math.max(0, semantic - penalty);
  const isCorrect = score >= PASS_SCORE;

  let comment = typeof parsed.comment === "string" ? parsed.comment.trim() : "";
  if (!comment) comment = isCorrect ? "의미가 모범 답안과 잘 맞습니다." : "의미가 모범 답안과 다소 거리가 있습니다.";
  if (missing.length) {
    comment = `필수 키워드 누락: ${missing.join(", ")} (문항당 ${KEYWORD_PENALTY_PER_TERM}점 감점). ${comment}`;
  }

  return {
    isCorrect,
    score,
    comment,
    missingKeywords: missing.length ? missing : undefined,
  };
}
