export const TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK = "gpt-4o-mini";

export const TEXTBOOK_AUTO_SYSTEM_PROMPT = `당신은 한국어 교육용 교재 편집자입니다. 사용자가 제공한 원문(지문·교재 텍스트)을 바탕으로, 지정된 단원 번호에 맞는 학습지 초안을 **JSON 객체 하나**로만 출력합니다.

형식 규칙:
- 마크다운 표·HTML 표는 사용하지 않습니다.
- "핵심요약(coreSummary)"은 문자열 배열(불릿 문장)입니다.
- "확인학습(practice)"은 **주관식 단답형 질문 문장만** 문자열 배열로 넣습니다. 정답·선택지·해설은 넣지 않습니다.
- "단원평가(unitTest)"는 **객체 배열**입니다. 각 원소는 반드시 "kind" 필드를 가집니다.
  - 객관식: { "kind": "mcq", "question": "...", "choices": ["보기1","보기2","보기3","보기4"] } — 보기는 **서로 다르고** 의미가 있어야 하며, 질문과 논리적으로 대응합니다. 보기 개수는 정확히 4개를 권장합니다.
  - 주관식 단답: { "kind": "short", "question": "..." }

내용 완전성(매우 중요):
- **내용학습(contentStudy)**: 원문에 있는 **주장·근거·예시·정의·수치·인물·대조·절차 등 중요 정보가 누락되지 않도록** 합니다. 임의로 큰 단락·주제를 통째로 생략하거나, 한두 줄로 과도하게 축약하여 정보를 버리지 마세요. 각 소제목 블록의 bullets는 **원문 사실을 충분히** 담도록 여러 문장으로 나눕니다.
- **핵심개념(keyConcepts)**: 각 항목은 { "concept": "용어", "explanation": "짧고 명확한 설명" } 형태입니다.

문항 개수:
- 사용자가 지정한 개수만큼 practice, unitTest의 mcq/short를 **정확히** 맞춥니다.

JSON 키 이름과 구조를 반드시 지키세요.`;

export function buildTextbookUnitUserPrompt(params: {
  bookTitle: string;
  sourceText: string;
  unitIndex: number;
  totalUnits: number;
  practiceMin: number;
  unitTestMcq: number;
  unitTestShort: number;
}): string {
  const { bookTitle, sourceText, unitIndex, totalUnits, practiceMin, unitTestMcq, unitTestShort } = params;
  const k = unitIndex + 1;
  const testTotal = unitTestMcq + unitTestShort;
  return `교재 제목(참고): ${bookTitle}

전체 원문(일부일 수 있음):
---
${sourceText}
---

총 단원 수: ${totalUnits}개 중 **제 ${k}단원**만 작성하세요. 앞뒤 단원 내용은 쓰지 말고, 이 단원 분량에 맞게 원문에서 다루 범위를 스스로 나눕니다.

다음 개수를 **정확히** 지키세요:
- 확인학습(practice): **정확히 ${practiceMin}개** (주관식 단답형 질문 문장만, 정답 금지)
- 단원평가(unitTest): **객관식(kind="mcq") ${unitTestMcq}개 + 주관식 단답(kind="short") ${unitTestShort}개** (합계 ${testTotal}개). 순서는 자유지만 총량과 종류 개수는 맞출 것.

응답 JSON 스키마 (키만 이 이름을 사용):

{
  "unitTitle": string,
  "keyConcepts": [ { "concept": string, "explanation": string }, ... ],
  "contentStudy": [ { "title": string, "bullets": string[] }, ... ],
  "coreSummary": string[],
  "practice": string[],
  "unitTest": [
    { "kind": "mcq", "question": string, "choices": string[] },
    { "kind": "short", "question": string }
  ]
}`;
}
