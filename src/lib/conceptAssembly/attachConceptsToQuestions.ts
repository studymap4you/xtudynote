import type { BookletContent, ConceptSection, QuestionSection } from "@/types/conceptAssembly";

export function attachConceptsToQuestions<T>(
  conceptSection: ConceptSection | null | undefined,
  questions: readonly T[],
): BookletContent<T> {
  const questionSection: QuestionSection<T> = { type: "questions", questions };
  if (!conceptSection?.blocks.length) return { sections: [questionSection] };
  return { sections: [conceptSection, questionSection] };
}

