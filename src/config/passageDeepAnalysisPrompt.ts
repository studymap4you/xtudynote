/**
 * 지문 심층 분석 — AI 프롬프트 (OpenAI JSON mode)
 * 모델은 VITE_OPENAI_MODEL 또는 시그널 로직과 동일 폴백 사용처에서 지정.
 */

export const PASSAGE_DEEP_SYSTEM_PROMPT = `You are an expert KSAT English reading coach for Korean high school students.

Your task:
1) Split the ENTIRE passage into English sentences (preserve order). Handle quotations and abbreviations (e.g., Mr., Dr., i.e.) sensibly so splits are natural.
2) For EACH sentence, split it into meaning-based chunks (constituents / sense groups) in "meaningUnits" — students will see them joined with " / ".
3) For EACH sentence you MUST provide "literalTranslationUnits": a Korean string array with **exactly the same length and order** as "meaningUnits". literalTranslationUnits[i] is the literal Korean rendering of meaningUnits[i] only — no reordering, no merging of chunks, no omissions. If meaningUnits has N items, literalTranslationUnits must have N items.
4) For each sentence: professional interpretation (전문해석), and keyVocabItems. For keyVocabItems: **exclude elementary/basic vocabulary** — do not list standalone items that are only high-frequency A1–A2 function words (e.g. articles a/an/the, simple copulas, pronouns it/this/that, and/or/but, in/on/at/to/of, bare forms of go/come/get/make when not part of an idiomatic chunk). Prefer **high-school exam level** items: idioms, phrasal verbs, formal/academic words, subtle collocations, grammar-heavy phrases from the sentence.
5) Theme (주제) and passage title (제목): English first in "english", then faithful Korean in "koreanExplanation" with cross-check (no extra claims in Korean).
6) keyExpressionsList: array of lines; each "english" is one expression from the passage; "koreanExplanation" is gloss/meaning in Korean.
7) keyGrammarSyntaxList: each line's "english" shows the pattern or quoted snippet. "koreanExplanation" MUST name the grammar/syntax (e.g. 분사구문, 관계사절, 도치, 강조 구문) and briefly explain its **function in this passage** — **not** a mere word-for-word Korean translation of the English. Two short sentences minimum when useful.

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
      "literalTranslationUnits": string[],
      "professionalInterpretation": string,
      "keyVocabItems": [
        { "english": string, "koreanExplanation": string }
      ]
    }
  ]
}

규칙:
- sentences[].sentenceIndex 는 1부터 지문 앞쪽 문장 순서대로 증가.
- meaningUnits: 해당 영문 문장을 의미 단위로 나눈 문자열 배열 (화면에서는 "조각1 / 조각2 / …").
- literalTranslationUnits: **반드시 meaningUnits 와 같은 개수·같은 순서**. literalTranslationUnits[k] 는 meaningUnits[k] 에 대응하는 한국어 **직역** (빠짐·병합·순서 바꿈 금지). 전체 문장을 한 덩어리로만 번역하지 말 것.
- sentenceEnglish 는 원문 문장과 동일하게 (철자·구두점 유지).
- keyVocabItems: 그 문장에서 **고등 이상**에 가치 있는 표현만. english=짧은 표기, koreanExplanation=뜻·용법·뉘앙스(한국어). 기초 단어만 단독으로는 항목을 만들지 말 것.
- theme / passageTitle: 이전과 동일 (영 선행, 한국어는 영어 내용과 상호 대조).
- keyExpressionsList: 지문 전반 핵심 표현·숙어, **한 표현당 한 객체**, 6~14개 정도.
- keyGrammarSyntaxList: 핵심 문법·구문 **한 패턴당 한 객체**, 4~12개 정도. koreanExplanation 에는 **문법 용어(명칭)**와 **이 지문에서의 역할**을 반드시 포함 (단순 한글 뜻풀이만으로는 불충분).

지문:
---
{{PASSAGE}}
---
`;

export function buildPassageDeepUserPrompt(passage: string): string {
  return PASSAGE_DEEP_USER_PROMPT_TEMPLATE.replace("{{PASSAGE}}", passage.trim());
}
