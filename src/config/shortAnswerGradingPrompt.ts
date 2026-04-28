/**
 * 단답형 의미 채점 — Exact match 금지, 의미적 유사도 기준.
 * 실제 점수는 클라이언트에서 필수 키워드 누락 감점을 추가로 적용합니다.
 */
export const SHORT_ANSWER_GRADE_SYSTEM = `You are a fair grader for short free-text answers (often Korean or mixed with English terms).
Compare the STUDENT_ANSWER to the MODEL_ANSWER by **semantic similarity**, not literal string match.
- Paraphrases, synonyms, and reordering are acceptable if the core meaning matches.
- If the student is partially correct, assign a partial score.
- Respond ONLY with a single JSON object, no markdown, no extra keys:
  {"semanticScore": <integer 0-100>, "comment": "<brief feedback in Korean, 1-3 sentences>"}
The semanticScore is before keyword penalties; the app will subtract points for missing required keywords.`;

export function buildShortAnswerGradeUserPrompt(input: {
  questionPrompt: string;
  modelAnswer: string;
  studentAnswer: string;
  requiredKeywords: string[];
  missingKeywords: string[];
}): string {
  const req = input.requiredKeywords.length
    ? input.requiredKeywords.join(", ")
    : "(없음)";
  const miss = input.missingKeywords.length ? input.missingKeywords.join(", ") : "(누락 없음)";
  return `QUESTION: ${input.questionPrompt}

MODEL_ANSWER (reference, not for copy-paste matching):
${input.modelAnswer}

STUDENT_ANSWER:
${input.studentAnswer}

REQUIRED_KEYWORDS (must appear in student text for full credit — app already detected missing): ${req}
PRE_DETECTED_MISSING: ${miss}

Grade semantic alignment 0-100. If missing keywords exist, you may note it in comment but still base semanticScore mainly on meaning vs model answer.`;
}
