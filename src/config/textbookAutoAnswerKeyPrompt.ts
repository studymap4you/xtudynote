import type { TextbookAnswerKeyStub } from "@/types/textbookAuto";

export const TEXTBOOK_ANSWER_KEY_MODEL_FALLBACK = "gpt-4o-mini";

export const TEXTBOOK_ANSWER_KEY_SYSTEM = `당신은 한국어 교육용 해설 작성자입니다. 주어진 문항 id는 절대 바꾸지 마세요. 각 문항에 대해 간결한 정답(또는 모범 답안)과, 불릿 리스트 형태의 해설을 JSON으로만 출력합니다.
규칙:
- 표·HTML·마크다운 표는 사용하지 않습니다.
- explanationBullets는 근거·오답 포인트·시그널 논리 등을 2~5개 불릿으로 적습니다.
- 해설에는 **위에 제시된 단원 맥락(핵심개념·핵심요약 등)** 을 자연스럽게 연결하고, 가능하면 **지문 발췌(영문)** 나 지문 속 핵심 표현을 따옴표로 짧게 인용해 근거를 드러냅니다.
- id 목록에 없는 키를 만들지 마세요.`;

export function buildTextbookAnswerKeyUserPrompt(params: {
  bookTitle: string;
  unitTitle: string;
  unitIndexOneBased: number;
  stubs: TextbookAnswerKeyStub[];
  /** 지문 일부 — 근거 인용용 */
  sourceExcerpt?: string;
  /** 핵심개념·요약 등 */
  unitKeyContext?: string;
}): string {
  const lines = params.stubs.map((s) => `- id: ${s.id}\n  question: ${JSON.stringify(s.question)}`);
  const excerpt =
    params.sourceExcerpt?.trim() ?
      `\n\n지문 발췌(근거용, 일부):\n---\n${params.sourceExcerpt.trim()}\n---`
    : "";
  const kctx =
    params.unitKeyContext?.trim() ?
      `\n\n단원 맥락(정답·해설 때 반드시 참고):\n${params.unitKeyContext.trim()}`
    : "";
  return `교재: ${params.bookTitle}
단원: 제 ${params.unitIndexOneBased}단원 — ${params.unitTitle}${excerpt}${kctx}

다음 문항 각각에 대해 answer(한 문단 이내 문자열)와 explanationBullets(문자열 배열, 2~5개)를 채우세요.

${lines.join("\n\n")}

응답 JSON 형식:
{ "items": [ { "id": "<위와 동일>", "answer": string, "explanationBullets": string[] } ] }
items 배열 길이와 id는 위 목록과 1:1로 일치해야 합니다.`;
}
