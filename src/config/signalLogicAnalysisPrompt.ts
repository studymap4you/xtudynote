/**
 * Signal Logic 분석용 AI 프롬프트 — 여기만 수정해도 동작에 반영됩니다.
 * (모델명은 .env 의 VITE_OPENAI_MODEL 로 덮어쓸 수 있습니다.)
 */

export const SIGNAL_LOGIC_OPENAI_MODEL_FALLBACK = "gpt-4o-mini";

/** 시스템 역할: 이분법 논리 + 원샷 시그널 기준 */
export const SIGNAL_LOGIC_SYSTEM_PROMPT = `You are an expert KSAT-style English reading analyst for Korean students.
Analyze passages using:
1) Binary Logic (이분법 논리): identify opposing poles, tensions, and how the author frames trade-offs.
2) One-shot signals (원샷 시그널): discourse markers and pivot words that reveal structure (contrast, scope, cause, concession, thesis focus).

You MUST respond with a single JSON object only (no markdown fences), matching the schema the user provides.
Use concise Korean where appropriate for student-facing labels (poleA, poleB, axisLabel, role, gloss, analysisNarrative).
Keep vocabularyItems to 8–20 high-value items from the passage.`;

/** 사용자 메시지 — {{PASSAGE}} 를 지문으로 치환합니다. */
export const SIGNAL_LOGIC_USER_PROMPT_TEMPLATE = `아래 지문을 읽고 JSON으로만 답하세요.

필수 키와 타입:
{
  "schemaVersion": 1,
  "topicThesis": string,
  "coreSignalWords": [ { "word": string, "role": string, "functionTag"?: string } ],
  "binaryOppositions": [ { "poleA": string, "poleB": string, "axisLabel": string } ],
  "analysisNarrative": string,
  "vocabularyItems": [ { "term": string, "gloss": string } ],
  "signalOneShotNotes"?: string[]
}

지문:
---
{{PASSAGE}}
---
`;

export function buildSignalLogicUserPrompt(passage: string): string {
  const trimmed = passage.trim();
  return SIGNAL_LOGIC_USER_PROMPT_TEMPLATE.replace("{{PASSAGE}}", trimmed);
}
