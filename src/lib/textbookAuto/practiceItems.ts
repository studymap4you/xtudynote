import type { TextbookPracticeItem } from "@/types/textbookAuto";

export function practiceItemQuestion(p: TextbookPracticeItem): string {
  return (p.question ?? "").trim();
}

export function practiceQuestionsForList(practice: TextbookPracticeItem[]): string[] {
  return practice.map(practiceItemQuestion).filter(Boolean);
}
