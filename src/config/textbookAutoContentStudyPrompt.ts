import { TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK } from "@/config/textbookAutoPrompt";

export const TEXTBOOK_CONTENT_STUDY_BLOCK_SYSTEM = `당신은 한국어 교재 편집자입니다. 사용자가 제공한 단원 원문만 근거로 내용학습 블록을 작성합니다.
- 출력은 JSON 한 개만 (마크다운·HTML 금지).
- 불릿은 문자열 배열 bullets — 각 문자열은 완결된 문장.
- 원문 사실을 임의로 생략하지 말고, 제목·맥락에 맞게 충분히 나눕니다.
- JSON 키 이름을 정확히 지킵니다.`;

export function buildContentStudyFullBlockUserPrompt(params: {
  bookTitle: string;
  unitTitle: string;
  sourceText: string;
  existingBlockTitles: string[];
}): string {
  const titles = params.existingBlockTitles.filter(Boolean);
  const avoid =
    titles.length > 0
      ? `이미 사용된 소제목(가능하면 중복·유사 제목 피하기): ${titles.join(" · ")}`
      : "(아직 다른 블록 제목 없음)";
  return `교재: ${params.bookTitle}
단원 제목: ${params.unitTitle}

단원 원문:
---
${params.sourceText}
---

${avoid}

이 원문에서 **새 소제목 하나**와, 그에 맞는 **설명 불릿(문자열 배열)**을 작성하세요.
응답 형식만 사용:
{ "title": string, "bullets": string[] }
bullets는 최소 4개, 최대 12개 권장.`;
}

export function buildContentStudyBulletsUserPrompt(params: {
  bookTitle: string;
  unitTitle: string;
  sourceText: string;
  blockTitle: string;
}): string {
  return `교재: ${params.bookTitle}
단원 제목: ${params.unitTitle}

단원 원문:
---
${params.sourceText}
---

사용자가 정한 **내용학습 소제목**: 「${params.blockTitle}」

위 소제목과 직접 관련된 내용을 원문에서 찾아, 학습용 **불릿 문장 배열**만 작성하세요.
응답 형식만 사용:
{ "bullets": string[] }
bullets는 최소 4개, 최대 14개 권장. 원문 정보 누락을 줄이세요.`;
}

export function readOpenAiModelForContentStudy(): string {
  const m = String(import.meta.env.VITE_OPENAI_MODEL ?? "").trim();
  return m || TEXTBOOK_AUTO_OPENAI_MODEL_FALLBACK;
}
