/**
 * 지문 심층 분석 — AI 프롬프트 (OpenAI JSON mode)
 * 모델은 VITE_OPENAI_MODEL 또는 시그널 로직과 동일 폴백 사용처에서 지정.
 */

export const PASSAGE_DEEP_SYSTEM_PROMPT = `You are an expert KSAT English reading coach for Korean high school students.

Your task:
1) Split the ENTIRE passage into English sentences (preserve order). Handle quotations and abbreviations (e.g., Mr., Dr., i.e.) sensibly so splits are natural.
2) For EACH sentence, split it into meaning-based chunks (constituents / sense groups). Represent those chunks as separate strings in the "meaningUnits" array — students will see them joined with " / ".
3) For each sentence provide: literal Korean translation (직독직해), richer interpretation (전문해석), and key vocabulary/expressions as an array of bilingual items. Each keyVocabItems entry is ONE expression or short phrase: "english" = the term from the passage (short), "koreanExplanation" = gloss/usage in Korean. Never merge many unrelated terms into one array element.
4) Theme (주제) and passage title (제목): ALWAYS write the English content first in "english". Then write "koreanExplanation" as a faithful Korean rendering or explanation of that same English content only — do not introduce claims, examples, or nuances in Korean that are absent from the English. Before finishing, mentally cross-check: every idea in Korean must correspond to the English, and vice versa for the main thesis (상호 대조 확인).
5) Sections 4 and 5 MUST be JSON arrays of line objects (not a single summary paragraph). Each array element is one row: one English expression/pattern in "english" and its Korean gloss in "koreanExplanation" (1:1). Do not put comma-separated lists of many unrelated expressions in one "english" string — use one array element per expression. Minimum 4 items each for a typical passage when possible.

You MUST return a single JSON object only (no markdown fences), matching the schema the user message specifies.
Never use Korean-only for fields that require bilingual objects: always pair English with Korean explanation.`;

export const PASSAGE_DEEP_USER_PROMPT_TEMPLATE = `아래 지문 전체를 처리하고 JSON으로만 답하세요.

출력 스키마 (모든 키 필수, sentences는 1개 이상).
- theme, passageTitle 및 sentences[].keyVocabItems[] 의 각 원소는 { "english": string, "koreanExplanation": string } 입니다.
- keyExpressionsList, keyGrammarSyntaxList 는 **배열**이며, 각 원소는 한 줄에 대응하는 { "english": string, "koreanExplanation": string } 입니다 (요약 문단 금지).

{
  "schemaVersion": 1,
  "theme": { "english": string, "koreanExplanation": string },
  "passageTitle": { "english": string, "koreanExplanation": string },
  "keyExpressionsList": [
    { "english": string, "koreanExplanation": string }
  ],
  "keyGrammarSyntaxList": [
    { "english": string, "koreanExplanation": string }
  ],
  "sentences": [
    {
      "sentenceIndex": number,
      "sentenceEnglish": string,
      "meaningUnits": string[],
      "literalTranslation": string,
      "professionalInterpretation": string,
      "keyVocabItems": [
        { "english": string, "koreanExplanation": string }
      ]
    }
  ]
}

규칙:
- sentences[].sentenceIndex 는 1부터 지문 앞쪽 문장 순서대로 증가.
- meaningUnits 는 해당 영문 문장을 의미 단위로 나눈 조각들의 배열 (학생 화면에서는 "조각1 / 조각2 / …" 형태로 표시됨).
- sentenceEnglish 는 원문 문장과 동일하게 (철자·구두점 유지).
- keyVocabItems: 그 문장에서 뽑은 표현마다 **배열 원소 하나씩**. english=짧은 영문 표기, koreanExplanation=뜻·용법·뉘앙스(한국어).
- theme: 먼저 주제를 영어로 명확히 작성(english). koreanExplanation 은 그 영어 내용을 직역하거나 충실히 의역한 한국어이며, 영어에 없는 새 주장을 넣지 마세요.
- passageTitle: 영문 제안 제목(english) 후, 제목에 담긴 의미만 반영한 한국어(koreanExplanation). 상호 대조로 영·한 불일치 금지.
- keyExpressionsList: 지문 전반의 핵심 표현·숙어를 **한 표현당 한 객체**로 6~14개 정도.
- keyGrammarSyntaxList: 핵심 문법·구문 패턴을 **한 패턴당 한 객체**로 4~12개 정도.

지문:
---
{{PASSAGE}}
---
`;

export function buildPassageDeepUserPrompt(passage: string): string {
  return PASSAGE_DEEP_USER_PROMPT_TEMPLATE.replace("{{PASSAGE}}", passage.trim());
}
