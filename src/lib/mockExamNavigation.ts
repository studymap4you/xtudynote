import type { OfficialExamResource } from "./officialExamResources";

export const ENGLISH_MOCK_EXAM_QUESTION_NUMBERS = Object.freeze([
  ...Array.from({ length: 7 }, (_, index) => index + 18),
  ...Array.from({ length: 17 }, (_, index) => index + 29),
]);

export const MOCK_EXAM_VARIANT_TYPES = Object.freeze([
  { id: "grammar", label: "어법", labelEn: "Grammar" },
  { id: "topic", label: "주제", labelEn: "Topic" },
  { id: "title", label: "제목", labelEn: "Title" },
  { id: "vocabulary", label: "어휘", labelEn: "Vocabulary" },
  { id: "implied_meaning", label: "함축 의미추론", labelEn: "Implied Meaning" },
  { id: "summary", label: "요약문 완성", labelEn: "Summary Completion" },
  { id: "blank_inference", label: "빈칸추론", labelEn: "Blank Inference" },
  { id: "paragraph_order", label: "문장의 순서", labelEn: "Sentence Order" },
  { id: "sentence_insertion", label: "문장삽입", labelEn: "Sentence Insertion" },
  { id: "irrelevant_sentence", label: "글의 흐름", labelEn: "Irrelevant Sentence" },
  { id: "factual_description", label: "내용일치", labelEn: "Factual Match" },
]);

const MOCK_EXAM_MONTHS = Object.freeze([3, 6, 9, 10]);

export function createMockExamPlaceholderSessions(
  grade: number,
  now: Date = new Date(),
  count = 6,
): OfficialExamResource[] {
  const sessions: OfficialExamResource[] = [];
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  for (let year = currentYear; sessions.length < count; year -= 1) {
    const months = MOCK_EXAM_MONTHS
      .filter((month) => year < currentYear || month <= currentMonth)
      .sort((left, right) => right - left);
    for (const month of months) {
      sessions.push({
        id: `placeholder-grade${grade}-${year}-${String(month).padStart(2, "0")}`,
        title: `${year}년 고${grade} ${month}월 영어 모의고사`,
        year,
        grade,
        month,
        organizer: "자료 연결 대기",
        collectedAt: null,
        files: [],
        placeholder: true,
      });
      if (sessions.length >= count) break;
    }
  }

  return sessions;
}

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
