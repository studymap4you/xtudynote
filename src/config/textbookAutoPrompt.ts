export const TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK = "gpt-4o-mini";

export const TEXTBOOK_AUTO_SYSTEM_PROMPT = `당신은 한국어 교육용 교재 편집자입니다. 사용자가 제공한 원문(지문·교재 텍스트)을 바탕으로, 지정된 단원 번호에 맞는 학습지 초안을 JSON 한 개로만 출력합니다.

규칙:
- 모든 설명·문항은 **불릿 리스트**(문자열 배열)로만 표현합니다. HTML 테이블·마크다운 표는 사용하지 마세요.
- "확인학습"과 "단원평가"에는 학생이 풀 수 있는 **질문 문장**을 리스트로 넣습니다 (정답은 이 단계에서 넣지 않습니다).
- 단원 제목(unitTitle)은 한 줄로 짧게 작성합니다.
- JSON 키 이름과 구조를 반드시 지키세요.`;

export function buildTextbookUnitUserPrompt(params: {
  bookTitle: string;
  sourceText: string;
  unitIndex: number;
  totalUnits: number;
}): string {
  const { bookTitle, sourceText, unitIndex, totalUnits } = params;
  const k = unitIndex + 1;
  return `교재 제목(참고): ${bookTitle}

전체 원문(일부일 수 있음):
---
${sourceText}
---

총 단원 수: ${totalUnits}개 중 **제 ${k}단원**만 작성하세요. 앞뒤 단원 내용은 쓰지 말고, 이 단원 분량에 맞게 원문에서 다루 범위를 스스로 나눕니다.

응답은 아래 JSON 스키마와 정확히 동일한 키만 사용하세요:
{
  "unitTitle": string,
  "keyConcepts": string[],
  "contentStudy": string[],
  "coreSummary": string[],
  "practice": string[],
  "unitTest": string[]
}`;
}
