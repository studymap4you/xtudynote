import type { OfficialExamResource } from "./officialExamResources";

export const ENGLISH_MOCK_EXAM_QUESTION_NUMBERS = Object.freeze(
  Array.from({ length: 45 }, (_, index) => index + 1),
);

export const MOCK_EXAM_VARIANT_TYPES = Object.freeze([
  { id: "purpose", label: "글의 목적", labelEn: "Purpose" },
  { id: "emotion_change", label: "심경 변화", labelEn: "Emotion Change" },
  { id: "claim", label: "필자의 주장", labelEn: "Claim" },
  { id: "main_idea", label: "글의 요지", labelEn: "Main Idea" },
  { id: "title", label: "글의 제목", labelEn: "Title" },
  { id: "topic", label: "글의 주제", labelEn: "Topic" },
  { id: "factual_description", label: "내용 일치·불일치", labelEn: "Factual Match" },
  { id: "grammar", label: "어법", labelEn: "Grammar" },
  { id: "vocabulary", label: "어휘", labelEn: "Vocabulary" },
  { id: "implied_meaning", label: "함축 의미", labelEn: "Implied Meaning" },
  { id: "blank_short", label: "빈칸 추론 (어구)", labelEn: "Short Blank" },
  { id: "blank_long", label: "빈칸 추론 (문장)", labelEn: "Long Blank" },
  { id: "irrelevant_sentence", label: "무관한 문장", labelEn: "Irrelevant Sentence" },
  { id: "paragraph_order", label: "글의 순서", labelEn: "Paragraph Order" },
  { id: "sentence_insertion", label: "문장 삽입", labelEn: "Sentence Insertion" },
  { id: "summary", label: "요약문 완성", labelEn: "Summary" },
  { id: "grammar_correction", label: "어법 오류 수정", labelEn: "Grammar Correction" },
]);

function collectedAtMs(exam: OfficialExamResource): number {
  if (!exam.collectedAt) return 0;
  const parsed = Date.parse(exam.collectedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortMockExamSessionsNewestFirst(
  exams: OfficialExamResource[],
): OfficialExamResource[] {
  return [...exams].sort((left, right) => (
    right.year - left.year
    || right.month - left.month
    || collectedAtMs(right) - collectedAtMs(left)
    || left.title.localeCompare(right.title, "ko")
  ));
}

export function formatMockExamSession(exam: OfficialExamResource): string {
  const year = exam.year > 0 ? `${exam.year}년` : "연도 미상";
  const month = exam.month > 0 ? `${String(exam.month).padStart(2, "0")}월` : "월 미상";
  return `${year} ${month}`;
}
