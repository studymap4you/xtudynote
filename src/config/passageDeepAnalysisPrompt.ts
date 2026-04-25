/**
 * 지문 심층 분석 — AI 프롬프트 (OpenAI JSON mode)
 * 모델은 VITE_OPENAI_MODEL 또는 시그널 로직과 동일 폴백 사용처에서 지정.
 */

export const PASSAGE_DEEP_SYSTEM_PROMPT = `You are an expert KSAT English reading coach for Korean high school students.

Your task:
1) Split the ENTIRE passage into English sentences (preserve order). Handle quotations and abbreviations (e.g., Mr., Dr., i.e.) sensibly so splits are natural.
2) For EACH sentence, split it into meaning-based chunks (constituents / sense groups). Represent those chunks as separate strings in the "meaningUnits" array — students will see them joined with " / ".
3) For each sentence provide: literal Korean translation (직독직해), richer interpretation (전문해석), and key vocabulary/expressions as an array of bilingual items: each item MUST have real English (or the exact phrase/term from the passage) in "english" and Korean explanation in "koreanExplanation". Do not leave "english" empty unless unavoidable.
4) For the whole passage, theme (주제), passage title (제목), key expressions summary (핵심표현정리), and key grammar/syntax (핵심문법/구문) MUST each be an object with BOTH "english" and "koreanExplanation" fields. Use English for thesis keywords, title wording, expressions, and grammar patterns; use Korean for clear student-facing commentary (해설).

You MUST return a single JSON object only (no markdown fences), matching the schema the user message specifies.
Never use Korean-only for fields that require bilingual objects: always pair English with Korean explanation.`;

export const PASSAGE_DEEP_USER_PROMPT_TEMPLATE = `아래 지문 전체를 처리하고 JSON으로만 답하세요.

출력 스키마 (모든 키 필수, sentences는 1개 이상). theme, passageTitle, keyExpressionsSummary, keyGrammarSyntax 및 sentences[].keyVocabItems[] 는 모두
{ "english": string, "koreanExplanation": string } 형태입니다. english 에는 반드시 영어(또는 지문에서 인용한 표현), koreanExplanation 에는 한국어 해설만 넣으세요.

{
  "schemaVersion": 1,
  "theme": { "english": string, "koreanExplanation": string },
  "passageTitle": { "english": string, "koreanExplanation": string },
  "keyExpressionsSummary": { "english": string, "koreanExplanation": string },
  "keyGrammarSyntax": { "english": string, "koreanExplanation": string },
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
- keyVocabItems 는 그 문장에서 뽑은 표현마다 한 줄씩: english=표기(영문), koreanExplanation=용법·뉘앙스 등 한국어.
- theme.english 는 주제를 한두 문장 영어로, theme.koreanExplanation 은 한국어로 풀어 설명.
- passageTitle.english 는 영문 제안 제목, passageTitle.koreanExplanation 은 제목이 잡히는 이유 등 한국어.
- keyExpressionsSummary / keyGrammarSyntax 의 english 에는 핵심 표현·구문을 불릿 형태 영어로, koreanExplanation 에는 전체 정리를 한국어로.

지문:
---
{{PASSAGE}}
---
`;

export function buildPassageDeepUserPrompt(passage: string): string {
  return PASSAGE_DEEP_USER_PROMPT_TEMPLATE.replace("{{PASSAGE}}", passage.trim());
}
