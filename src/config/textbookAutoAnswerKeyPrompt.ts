import type { TextbookAnswerKeyStub } from "@/types/textbookAuto";

export const TEXTBOOK_ANSWER_KEY_MODEL_FALLBACK = "gpt-4o-mini";

export const TEXTBOOK_ANSWER_KEY_SYSTEM = `당신은 한국어 교육용 해설 작성자입니다. 주어진 문항 id는 절대 바꾸지 마세요. 각 문항에 대해 간결한 정답(또는 모범 답안)과, 불릿 리스트 형태의 해설을 JSON으로만 출력합니다.
규칙:
- 표·HTML·마크다운 표는 사용하지 않습니다.
- explanationBullets는 근거·오답 포인트·시그널 논리 등을 2~5개 불릿으로 적습니다.
- id 목록에 없는 키를 만들지 마세요.`;

export function buildTextbookAnswerKeyUserPrompt(params: {
  bookTitle: string;
  unitTitle: string;
  unitIndexOneBased: number;
  stubs: TextbookAnswerKeyStub[];
}): string {
  const lines = params.stubs.map((s) => `- id: ${s.id}\n  question: ${JSON.stringify(s.question)}`);
  return `교재: ${params.bookTitle}
단원: 제 ${params.unitIndexOneBased}단원 — ${params.unitTitle}

다음 문항 각각에 대해 answer(한 문단 이내 문자열)와 explanationBullets(문자열 배열, 2~5개)를 채우세요.

${lines.join("\n\n")}

응답 JSON 형식:
{ "items": [ { "id": "<위와 동일>", "answer": string, "explanationBullets": string[] } ] }
items 배열 길이와 id는 위 목록과 1:1로 일치해야 합니다.`;
}
