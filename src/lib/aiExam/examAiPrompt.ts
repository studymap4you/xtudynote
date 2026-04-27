/**
 * 과목명에 영어 계열 포함 시 주관식 위주·근거 문장 필수 유도
 */
export function isEnglishSubject(subject: string): boolean {
  const s = subject.trim().toLowerCase();
  return (
    /\benglish\b/i.test(subject) ||
    subject.includes("영어") ||
    subject.includes("영문") ||
    s === "eng"
  );
}

export function buildExamAiSystemPrompt(isEnglish: boolean): string {
  const englishBlock = isEnglish
    ? `
영어 과목 규칙:
- 주관식(short) 문항만 출제한다(객관식 금지).
- 학생은 본문에 나온 문장 또는 구를 그대로 또는 최소 수정으로 적도록 유도하는 발문을 사용한다.
- 모범 답안(correctAnswer)과 근거 인용(evidenceQuote)은 본문의 실제 문구와 일치해야 한다.
`
    : `
유형 규칙:
- 요청된 객관식·주관식 개수를 정확히 맞춘다.
- 객관식은 정확히 4개 선택지.
`;

  return `당신은 교과 평가용 문항 작성 보조입니다. 모든 문항은 제공된 본문(passage)에 명시적으로 근거해야 하며, 본문에 없는 추측·개인 의견·주관적 해석은 금지합니다.

출력은 반드시 JSON 한 개(object)만 반환합니다. 스키마:
{
  "questions": [
    {
      "type": "mcq" | "short",
      "prompt": "문항 발문",
      "options": ["선지1","선지2","선지3","선지4"],
      "correctIndex": 0,
      "correctAnswer": "주관식 모범답 또는 객관식일 때 빈 문자열",
      "evidenceQuote": "본문에서 그대로 인용한 짧은 근거",
      "explanation": "왜 그 근거가 정답인지 본문과 연결하여 한국어로 간단히"
    }
  ]
}

공통 규칙:
- evidenceQuote는 본문에 실제로 존재하는 문장/구절을 따옴표 없이 인용 형태로 적되, 조작하지 말 것.
- explanation은 본문 근거와 정답의 논리적 연결만 서술. 외부 지식 금지.
- 이미 제공된 수동 문항과 동일하거나 거의 같은 발문을 만들지 말 것.
${englishBlock}
`;
}

export function buildExamAiUserPrompt(params: {
  passage: string;
  subject: string;
  nObjective: number;
  nSubjective: number;
  manualSummaries: string[];
}): string {
  const { passage, subject, nObjective, nSubjective, manualSummaries } = params;
  const avoid =
    manualSummaries.length > 0
      ? `\n다음 수동 문항과 중복하지 말 것 (발문 요지):\n${manualSummaries.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

  return `과목: ${subject}

본문(passage):
"""
${passage}
"""

생성할 AI 문항 개수: 객관식 ${nObjective}개, 주관식 ${nSubjective}개.
${avoid}

위 개수대로 questions 배열을 채워라. 객관식일 때만 options 4개와 correctIndex(0~3), correctAnswer는 빈 문자열. 주관식일 때 options 생략 또는 빈 배열, correctIndex는 0, correctAnswer에 모범 답을 넣어라.`;
}
