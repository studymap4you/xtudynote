import { SUPPORTED_CSAT_QUESTION_TYPES } from "./load-question-rules.mjs";

export const DEFAULT_TARGET_QUESTION_COUNT = 40;
export const MAX_TARGET_QUESTION_COUNT = 50;
export const MIN_TARGET_QUESTION_COUNT = 4;

const typeMatchers = [
  { pattern: /목적|purpose/iu, types: ["PURPOSE"] },
  { pattern: /심경|감정\s*변화|emotion/iu, types: ["EMOTION_CHANGE"] },
  { pattern: /함축|밑줄.*의미|implied/iu, types: ["IMPLIED_MEANING"] },
  { pattern: /요지|main\s*idea/iu, types: ["MAIN_IDEA"] },
  { pattern: /주장|claim/iu, types: ["CLAIM"] },
  { pattern: /주제|topic/iu, types: ["TOPIC"] },
  { pattern: /제목|title/iu, types: ["TITLE"] },
  { pattern: /도표|chart|graph/iu, types: ["CHART"] },
  { pattern: /내용\s*(?:일치|불일치).*설명|factual\s*description/iu, types: ["FACTUAL_DESCRIPTION"] },
  { pattern: /안내문|실용문|factual\s*practical/iu, types: ["FACTUAL_PRACTICAL"] },
  { pattern: /어법|문법|grammar/iu, types: ["GRAMMAR"] },
  { pattern: /어휘|vocabulary/iu, types: ["VOCABULARY"] },
  { pattern: /짧은\s*빈칸|단어\s*빈칸|blank\s*short/iu, types: ["BLANK_SHORT"] },
  { pattern: /긴\s*빈칸|절\s*빈칸|blank\s*long/iu, types: ["BLANK_LONG"] },
  { pattern: /빈칸|blank/iu, types: ["BLANK_SHORT", "BLANK_LONG"] },
  { pattern: /무관한\s*문장|글의\s*흐름|irrelevant/iu, types: ["IRRELEVANT_SENTENCE"] },
  { pattern: /문단\s*순서|글의\s*순서|순서\s*(?:배열|문제)?|paragraph\s*order/iu, types: ["PARAGRAPH_ORDER"] },
  { pattern: /문장\s*삽입|삽입|sentence\s*insertion/iu, types: ["SENTENCE_INSERTION"] },
  { pattern: /요약|summary/iu, types: ["SUMMARY"] },
  { pattern: /장문.*(?:설명|논설)|long\s*reading\s*1/iu, types: ["LONG_READING_1"] },
  { pattern: /장문.*(?:서사|이야기)|long\s*reading\s*2/iu, types: ["LONG_READING_2"] },
];

function unique(values) {
  return [...new Set(values)];
}

function inferTargetCount(text) {
  const explicit = text.match(/(\d{1,3})\s*(?:문항|문제|개)(?!년)/u);
  if (explicit) {
    return Math.min(MAX_TARGET_QUESTION_COUNT, Math.max(MIN_TARGET_QUESTION_COUNT, Number(explicit[1])));
  }
  const pageTarget = text.match(/(\d{1,3})\s*(?:쪽|페이지)/u);
  if (pageTarget) {
    // TODO(render-engine): replace this estimate with measured pagination when the render engine is introduced.
    const estimated = Math.round(Number(pageTarget[1]) * 0.8);
    return Math.min(MAX_TARGET_QUESTION_COUNT, Math.max(MIN_TARGET_QUESTION_COUNT, estimated));
  }
  return DEFAULT_TARGET_QUESTION_COUNT;
}

function inferTargetGrade(text) {
  if (/고\s*3|고등학교\s*3|수능|평가원|csat/iu.test(text)) return "high-school-3";
  if (/고\s*2|고등학교\s*2/iu.test(text)) return "high-school-2";
  if (/고\s*1|고등학교\s*1/iu.test(text)) return "high-school-1";
  return "high-school-3";
}

function inferTargetLevel(text) {
  if (/최상위|상위권|고난도|심화|1등급|high\s*(?:level)?/iu.test(text)) return "high";
  if (/하위권|기초|초보|노베|[6-9]등급|low\s*(?:level)?/iu.test(text)) return "low";
  return "medium";
}

function inferQuestionTypes(text) {
  const matched = [];
  for (const matcher of typeMatchers) {
    if (matcher.pattern.test(text)) matched.push(...matcher.types);
  }
  let types = unique(matched).filter((type) => SUPPORTED_CSAT_QUESTION_TYPES.includes(type));
  const shortBlankOnly = /짧은\s*빈칸|단어\s*빈칸|blank\s*short/iu.test(text)
    && !/긴\s*빈칸|절\s*빈칸|blank\s*long/iu.test(text);
  const longBlankOnly = /긴\s*빈칸|절\s*빈칸|blank\s*long/iu.test(text)
    && !/짧은\s*빈칸|단어\s*빈칸|blank\s*short/iu.test(text);
  if (shortBlankOnly) types = types.filter((type) => type !== "BLANK_LONG");
  if (longBlankOnly) types = types.filter((type) => type !== "BLANK_SHORT");
  return types;
}

export function parseUserRequest(value) {
  const userRequest = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 8_000);
  if (!userRequest) throw new Error("question-request-required");
  const targetQuestionCount = inferTargetCount(userRequest);
  return {
    userRequest,
    targetGrade: inferTargetGrade(userRequest),
    targetLevel: inferTargetLevel(userRequest),
    targetQuestionCount,
    requestedTypes: inferQuestionTypes(userRequest),
    pageTargetDetected: /(\d{1,3})\s*(?:쪽|페이지)/u.test(userRequest),
  };
}
